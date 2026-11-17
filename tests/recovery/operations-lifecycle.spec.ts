import {it,expect} from 'vitest';
import {OperationLifecycle} from '../../packages/document/src/operations/lifecycle.js';
import {OperationJournal,journalHash} from '../../packages/document/src/operations/journal.js';
import {newTimeCheck,type TimeCheckState} from '../../packages/document/src/operations/time-check.js';
import type {AccountHistory} from '../../packages/document/src/operations/closed.js';
const account='11111111-1111-4111-8111-111111111111',request='22222222-2222-4222-8222-222222222222';
const proof={requestId:request,state:'deleted',confirmedAt:'2026-11-01T00:00:00Z',checkExpiresAt:'2027-01-30T00:00:00Z'};
function fixture(){
 let saved:TimeCheckState=newTimeCheck(),now=0,calls=0,resolve!:(value:unknown)=>void;
 const histories=new Map<string,AccountHistory>(),records=new Map<string,string[]>();
 const journal=new OperationJournal({keys:async()=>[...records.keys()],read:async k=>records.get(k)??[],append:async(k,old,v)=>{records.set(k,[...old,v]);}});
 const ports={load:async()=>structuredClone(saved),save:async(s:TimeCheckState)=>{saved=structuredClone(s);},clock:()=>({continuity:'boot',now}),identifier:()=>crypto.randomUUID(),query:async()=>{calls++;return new Promise(r=>{resolve=r;});},accounts:async()=>[...histories.keys()],history:(id:string)=>({load:async()=>{const h=histories.get(id);if(!h)throw Error('HISTORY_NOT_FOUND');return structuredClone(h);},save:async(h:AccountHistory)=>{histories.set(id,structuredClone(h));}})};
 return {runtime:new OperationLifecycle(ports,journal),histories,journal,records,get state(){return saved;},get calls(){return calls;},clock:(n:number)=>{now=n;},reply:(v:unknown)=>resolve(v)};
}
it('authorizes independent publication only from confirmed account deletion, never from missing history',async()=>{
 const f=fixture();expect(await f.runtime.accountDeletionConfirmed(account)).toBe(false);await f.runtime.start(false);await f.runtime.rememberDeletion(account,request);expect(await f.runtime.accountDeletionConfirmed(account)).toBe(false);
 await f.runtime.acceptDeletion([proof],f.runtime.capture());expect(await f.runtime.accountDeletionConfirmed(account)).toBe(true);
});
it('shares publication query backoff and respects pauses and unavailable results',async()=>{
 const f=fixture(),id=crypto.randomUUID();await f.runtime.beginMutation(account,'commitPublication',{operationId:id},[{kind:'document',id:'document'}]);
 await f.runtime.publicationDeferred(account,id);expect(await f.runtime.publicationMayQuery(account,id)).toBe(false);f.clock(1000);expect(await f.runtime.publicationMayQuery(account,id)).toBe(true);
 await f.runtime.publicationDeferred(account,id);f.clock(2000);expect(await f.runtime.publicationMayQuery(account,id)).toBe(false);f.clock(3000);expect(await f.runtime.publicationMayQuery(account,id)).toBe(true);
 await f.journal.update(account,id,e=>({...e,pause:true}));expect(await f.runtime.publicationMayQuery(account,id)).toBe(false);
 await f.journal.update(account,id,e=>({...e,pause:false}));await f.runtime.publicationDeferred(account,id,'OPERATION_RESULT_UNAVAILABLE');f.clock(100000);expect(await f.runtime.publicationMayQuery(account,id)).toBe(false);
});
it('ignores late deletion replies after close and never treats pending or a different request as deletion',async()=>{
 const f=fixture();await f.runtime.start(false);await f.runtime.rememberDeletion(account,request);
 await f.runtime.acceptDeletion([{requestId:request,state:'pending'}],f.runtime.capture());expect(f.histories.get(account)!.phase).toBe('deleting');
 const epoch=f.runtime.capture();await f.runtime.interrupt('close');await f.runtime.acceptDeletion([proof],epoch);expect(f.histories.get(account)!.phase).toBe('deleting');
 await f.runtime.start(false);await f.runtime.acceptDeletion([{...proof,requestId:crypto.randomUUID()}],f.runtime.capture());expect(f.histories.get(account)!.phase).toBe('deleting');
 await f.runtime.acceptDeletion([proof],f.runtime.capture());expect(f.histories.get(account)!.phase).toBe('deleted');expect(f.calls).toBe(0);
});
it('counts an interrupted time query once, preserves waits on voluntary close and discards its response',async()=>{
 const f=fixture();await f.runtime.start(true);await f.runtime.rememberDeletion(account,request);await f.runtime.acceptDeletion([proof],f.runtime.capture());await f.runtime.tick();expect(f.calls).toBe(1);
 f.clock(100);await f.runtime.interrupt('suspend');await f.runtime.interrupt('suspend');expect(f.state.failures).toBe(1);
 await f.runtime.interrupt('close');expect(f.state.wait?.started).toBe(100);
 f.reply({});await Promise.resolve();await f.runtime.start(true);expect(f.calls).toBe(1);expect(f.state.failures).toBe(1);
 f.clock(5100);await f.runtime.tick();expect(f.calls).toBe(2);
});
it('isolates damaged history without exposing account identifiers or blocking healthy history',async()=>{
 const f=fixture();await f.runtime.start(false);await f.runtime.rememberDeletion(account,request);f.histories.set(crypto.randomUUID(),{} as AccountHistory);
 await f.runtime.acceptDeletion([proof],f.runtime.capture());await f.runtime.tick();
 expect(f.histories.get(account)!.phase).toBe('deleted');expect(f.runtime.notice).toContain('aislado');expect(f.runtime.notice??'').not.toContain(account);
});
it('journals authenticated mutations before transport without storing secrets and resolves the matching identity',async()=>{
 const f=fixture(),operationId=crypto.randomUUID();await f.runtime.start(false);
 await f.runtime.beginMutation(account,'password',{operationId,currentPassword:'never persist this',newPassword:'nor this'});
 expect(JSON.stringify([...f.records.values()])).not.toContain('never persist');
 expect((await f.journal.inspect(account,true)).entries[0]!.requestHash).toBe(await journalHash(JSON.stringify({accountId:account,type:'password',operationId})));
 expect((await f.journal.inspect(account,true)).entries[0]!.state).toBe('pending');
 await f.runtime.acceptOperation(account,'password',{operationId,state:'resolved',outcome:'success',confirmedAt:'2026-11-16T00:00:00Z',data:{}});
 expect((await f.journal.inspect(account,true)).entries[0]!.state).toBe('resolved');
 await f.runtime.rememberDeletion(account,request);await f.runtime.acceptDeletion([proof],f.runtime.capture());
 expect(f.histories.get(account)!.entries).toEqual([]);
});
it('removes cleared resolved entries from the hidden account snapshot without reconstructing the journal',async()=>{
 const f=fixture(),operationId=crypto.randomUUID();await f.runtime.start(false);await f.runtime.beginMutation(account,'updateProfile',{operationId});await f.runtime.acceptOperation(account,'updateProfile',{operationId,state:'resolved',outcome:'success',confirmedAt:'2026-11-16T00:00:00Z',data:{}});
 await f.runtime.rememberDeletion(account,request);expect(f.histories.get(account)!.entries).toHaveLength(1);
 await f.journal.update(account,operationId,()=>null);await f.runtime.tick();expect(f.histories.get(account)!.entries).toEqual([]);expect(f.histories.get(account)!.phase).toBe('deleting');expect((await f.journal.record(account,operationId)).value).toBeNull();
});
it('T061 admits independent scopes but refuses conflicting mutations before creating a journal entry',async()=>{
 const f=fixture(),one=crypto.randomUUID(),two=crypto.randomUUID(),blocked=crypto.randomUUID();
 await f.runtime.beginMutation(account,'trashPattern',{operationId:one},[{kind:'pattern',id:'p1'}]);
 await f.runtime.beginMutation(account,'trashPattern',{operationId:two},[{kind:'pattern',id:'p2'}]);
 await expect(f.runtime.beginMutation(account,'purge',{operationId:blocked},[{kind:'pattern',id:'p1'}])).rejects.toThrow('OPERATION_PENDING');
 expect((await f.journal.record(account,blocked)).exists).toBe(false);
 await f.runtime.beginMutation(account,'trashPattern',{operationId:one},[{kind:'pattern',id:'p1'}]);
});
