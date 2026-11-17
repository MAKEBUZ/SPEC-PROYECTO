import { it,expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { closeHistory,historyView,pendingDeletion,recoverHistory,receiveClosedResult,checkClosedRetention,applyDeletedHistory } from '../../packages/document/src/operations/closed.js';
import type { AccountHistory } from '../../packages/document/src/operations/closed.js';
import type { TimeCheckState } from '../../packages/document/src/operations/time-check.js';
import { OperationJournal,journalKey } from '../../packages/document/src/operations/journal.js';
import { DesktopJournalStorage } from '../../apps/desktop/src/main/operations/storage.js';
import { mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const DAY=86400000;
it('persists closure and resolved tombstones through the existing journal and survives reopening',async()=>{
 const root=await mkdtemp(join(tmpdir(),'patron-close-history-'));
 try{
  const f=fixture(),storage=new DesktopJournalStorage(root),journal=new OperationJournal(storage),resolvedId=randomUUID();
  await journal.create(f.history.entries[0]!);await journal.create({...f.history.entries[0]!,operationId:resolvedId});
  await journal.update(f.history.accountId,resolvedId,r=>({...r,state:'resolved',outcome:'success',confirmedAt:f.proof.confirmedAt,receivedAt:100}));
  const closed=closeHistory(pendingDeletion(f.history,f.requestId),f.proof,f.clock);
  const applied=await applyDeletedHistory(journal,closed);
  expect((await new OperationJournal(storage).inspect(f.history.accountId,true)).entries).toEqual([]);
  expect(await applyDeletedHistory(new OperationJournal(storage),applied)).toEqual(applied);
  const last=(await storage.read(journalKey(f.history.accountId,resolvedId))).at(-1)!;expect(JSON.parse(JSON.parse(last).payload).value).toBeNull();
  const pending=(await storage.read(journalKey(f.history.accountId,f.operationId))).at(-1)!;expect(JSON.parse(JSON.parse(pending).payload).value).toMatchObject({state:'closed',closedAt:100,pause:true});
 }finally{await rm(root,{recursive:true,force:true});}
});
function fixture(){
 const accountId=randomUUID(),requestId=randomUUID(),operationId=randomUUID();
 const history:AccountHistory={accountId,phase:'active',entries:[{accountId,operationId,requestHash:'a'.repeat(64),type:'commitPublication',state:'pending',pause:true,retryLevel:3,deadline:99,status:'ready',scopes:[{kind:'pattern',id:randomUUID()}]}]};
 return {history,requestId,operationId,clock:{continuity:'boot',now:100},proof:{requestId,state:'deleted',confirmedAt:'2026-11-01T00:00:00.000Z',checkExpiresAt:'2027-01-30T00:00:00.000Z'}};
}
it('hides pending deletion without clearing pauses or pending work and requires normal login after recovery',()=>{
 const f=fixture(),hidden=pendingDeletion(f.history,f.requestId);
 expect(historyView(hidden,f.history.accountId,true)).toEqual([]);expect(hidden.entries).toEqual(f.history.entries);
 const recovered=recoverHistory(hidden,{...f.proof,state:'cancelled'});expect(historyView(recovered,f.history.accountId,false)).toEqual([]);expect(historyView(recovered,f.history.accountId,true)).toEqual(f.history.entries);
});
it('uses a persisted service time interval after restart without resetting retention',()=>{
 const f=fixture();const time=(continuity:string,now:number,lower:number,upper=lower+2):TimeCheckState=>({phase:'complete',failures:0,warning:false,evidence:{responseId:randomUUID(),continuity,receivedMonotonic:now,lower,upper}});
 const closed=closeHistory(pendingDeletion(f.history,f.requestId),f.proof,f.clock,time('boot',100,1000));
 expect(closed.retention).toMatchObject({earliestDeadline:1000+30*DAY,latestDeadline:1002+30*DAY});
 expect(checkClosedRetention(closed,{continuity:'new',now:0}).retention!.state).toBe('uncertain');
 expect(checkClosedRetention(closed,{continuity:'new',now:0},time('new',0,1000+DAY)).retention!.state).toBe('valid');
 expect(checkClosedRetention(closed,{continuity:'new',now:0},time('new',0,1000+30*DAY)).retention!.state).toBe('uncertain');
 const expired=checkClosedRetention(closed,{continuity:'new',now:0},time('new',0,1002+30*DAY));expect(expired.retention!.state).toBe('expired');
 expect(checkClosedRetention(expired,{continuity:'new',now:0},time('new',0,0)).retention!.state).toBe('expired');
 expect(()=>checkClosedRetention(closed,{continuity:'new',now:0},{...time('new',0,0),phase:'save_pending'})).toThrow('TIME_CHECK_DAMAGED');
});
it('closes only on explicit matching deletion and removes resolved history without inventing outcomes',()=>{
 const f=fixture();f.history.entries.push({...f.history.entries[0]!,operationId:randomUUID(),state:'resolved',outcome:'success',confirmedAt:f.proof.confirmedAt,receivedAt:50});
 const pending=pendingDeletion(f.history,f.requestId);
 expect(()=>closeHistory(pending,{...f.proof,requestId:randomUUID()},f.clock)).toThrow();
 expect(()=>closeHistory(pending,{requestId:f.requestId,state:'pending'},f.clock)).toThrow();
 const closed=closeHistory(pending,f.proof,f.clock);expect(closed.entries).toHaveLength(1);expect(closed.entries[0]).toMatchObject({state:'closed',pause:true,retryLevel:3});expect(closed.entries[0]!.outcome).toBeUndefined();
 expect(historyView(closed,f.history.accountId,true)).toEqual([]);expect(historyView(closed,randomUUID(),true)).toEqual([]);
 expect(closeHistory(closed,f.proof,{continuity:'boot',now:500})).toEqual(closed);
});
it('preserves the initial 30-day deadline, expires inclusively and never reactivates',()=>{
 const f=fixture(),closed=closeHistory(pendingDeletion(f.history,f.requestId),f.proof,f.clock);
 const current=checkClosedRetention(closed,{continuity:'boot',now:100+30*DAY-1});expect(current.retention!.state).toBe('valid');
 const expired=checkClosedRetention(current,{continuity:'boot',now:100+30*DAY});expect(expired.retention!.state).toBe('expired');
 expect(checkClosedRetention(expired,{continuity:'new',now:0}).retention!.state).toBe('expired');
});
it('discards late results during uncertain time and never replays them after certainty returns',()=>{
 const f=fixture(),closed=closeHistory(pendingDeletion(f.history,f.requestId),f.proof,f.clock);
 const reply={accountId:f.history.accountId,requestHash:'a'.repeat(64),result:{operationId:f.operationId,operationType:'commitPublication',state:'resolved',outcome:'success',confirmedAt:f.proof.confirmedAt,authorizedResourceRefs:[],actorLabel:'Cuenta eliminada'}};
 const uncertain=receiveClosedResult(closed,reply,{continuity:'unknown',now:0});expect(uncertain.entries[0]!.outcome).toBeUndefined();expect(uncertain.retention!.state).toBe('uncertain');
 const validAgain=checkClosedRetention(uncertain,{continuity:'boot',now:200});expect(validAgain.entries[0]!.outcome).toBeUndefined();
 const accepted=receiveClosedResult(validAgain,reply,{continuity:'boot',now:300});expect(accepted.entries[0]).toMatchObject({state:'closed',outcome:'success',closedAt:100});expect(accepted.retention!.started).toEqual(f.clock);
 expect(receiveClosedResult(accepted,{...reply,accountId:randomUUID()},{continuity:'boot',now:400}).entries).toEqual(accepted.entries);
});
it.each(['wrong-account','wrong-hash','wrong-operation','wrong-type','malformed','expired'])('ignores %s replies without creating visible or retryable history',kind=>{
 const f=fixture(),closed=closeHistory(pendingDeletion(f.history,f.requestId),f.proof,f.clock);
 const result={operationId:kind==='wrong-operation'?randomUUID():f.operationId,operationType:kind==='wrong-type'?'other':'commitPublication',state:'resolved',outcome:'success',confirmedAt:f.proof.confirmedAt,authorizedResourceRefs:[],actorLabel:'Cuenta eliminada'};
 const next=receiveClosedResult(closed,{accountId:kind==='wrong-account'?randomUUID():f.history.accountId,requestHash:kind==='wrong-hash'?'b'.repeat(64):'a'.repeat(64),result:kind==='malformed'?{}:result},{continuity:'boot',now:kind==='expired'?100+30*DAY:200});
 expect(next.entries[0]!.outcome).toBeUndefined();expect(next.entries[0]!.state).toBe('closed');expect(historyView(next,next.accountId,true)).toEqual([]);expect(next.retention!.started).toEqual(f.clock);
});
it('does not reconstruct a removed resolved entry from a late result',()=>{
 const f=fixture();f.history.entries[0]={...f.history.entries[0]!,state:'resolved',outcome:'success',confirmedAt:f.proof.confirmedAt,receivedAt:0};
 const closed=closeHistory(pendingDeletion(f.history,f.requestId),f.proof,f.clock);
 const reply={accountId:f.history.accountId,requestHash:'a'.repeat(64),result:{operationId:f.operationId,operationType:'commitPublication',state:'resolved',outcome:'success',confirmedAt:f.proof.confirmedAt,authorizedResourceRefs:[],actorLabel:'Cuenta eliminada'}};
 expect(receiveClosedResult(closed,reply,{continuity:'boot',now:200}).entries).toEqual([]);
});
