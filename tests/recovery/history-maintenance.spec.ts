import { it,expect } from 'vitest';
import { mkdtemp,rm,readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { HistoryMaintenance } from '../../packages/document/src/operations/maintenance.js';
import { closeHistory,pendingDeletion,type AccountHistory } from '../../packages/document/src/operations/closed.js';
import { OperationJournal,journalKey } from '../../packages/document/src/operations/journal.js';
import { DesktopJournalStorage } from '../../apps/desktop/src/main/operations/storage.js';
it('FR-264 reopens after partial cleanup and retires remaining records without reconstructing completed deletions',async()=>{
 const root=await mkdtemp(join(tmpdir(),'patron-partial-clean-'));
 try{
  const storage=new DesktopJournalStorage(root),accountId=randomUUID(),requestId=randomUUID();let compactions=0,completedKey='';
  const journal=new OperationJournal({keys:()=>storage.keys(),read:k=>storage.read(k),append:(k,old,v)=>storage.append(k,old,v),compact:async k=>{if(++compactions===2)throw Error('interrupted cleanup');await storage.compact(k);completedKey=k;}});
  const entries=[0,1].map(()=>({accountId,operationId:randomUUID(),requestHash:'a'.repeat(64),type:'test',state:'pending' as const,pause:false,retryLevel:0,deadline:null,status:'ready' as const,scopes:[]}));
  for(const entry of entries)await journal.create(entry);
  let history=closeHistory(pendingDeletion({accountId,phase:'active',entries},requestId),{requestId,state:'deleted',confirmedAt:'2026-11-01T00:00:00Z',checkExpiresAt:'2027-01-30T00:00:00Z'},{continuity:'boot',now:0});
  const ports={load:async()=>structuredClone(history),save:async(h:AccountHistory)=>{history=structuredClone(h);},clock:()=>({continuity:'boot',now:30*86400000}),time:async()=>undefined};
  const first=new HistoryMaintenance(journal,ports);await first.tick(true);
  expect(first.notice).not.toBeNull();expect(history.retention?.state).toBe('expired');
  expect(compactions).toBe(2);expect(completedKey).not.toBe('');
  await expect(readFile(join(root,completedKey,'0000000001.json'))).rejects.toMatchObject({code:'ENOENT'});
  const reopened=new OperationJournal(new DesktopJournalStorage(root));const next=new HistoryMaintenance(reopened,ports);await next.tick(true);
  expect(next.notice).toBeNull();expect(history.entries).toEqual([]);
  for(const entry of entries){await expect(reopened.create(entry)).rejects.toThrow('OPERATION_ID_REUSED');await expect(readFile(join(root,journalKey(accountId,entry.operationId),'0000000001.json'))).rejects.toMatchObject({code:'ENOENT'});}
 }finally{await rm(root,{recursive:true,force:true});}
});
it('blocks cleanup on failed persistence, retries offline, and removes only durably expired records',async()=>{
 const root=await mkdtemp(join(tmpdir(),'patron-maintenance-'));
 try{
  const storage=new DesktopJournalStorage(root),journal=new OperationJournal(storage),accountId=randomUUID(),operationId=randomUUID(),requestId=randomUUID();
  const entry={accountId,operationId,requestHash:'a'.repeat(64),type:'test',state:'pending' as const,pause:true,retryLevel:1,deadline:null,status:'ready' as const,scopes:[]};await journal.create(entry);
  let history:AccountHistory=closeHistory(pendingDeletion({accountId,phase:'active',entries:[entry]},requestId),{requestId,state:'deleted',confirmedAt:'2026-11-01T00:00:00Z',checkExpiresAt:'2027-01-30T00:00:00Z'},{continuity:'boot',now:0});
  let now=30*86400000,fail=true,writes=0,continuity='boot';
  const maintenance=new HistoryMaintenance(journal,{load:async()=>structuredClone(history),save:async h=>{writes++;if(fail)throw Error('disk full');history=structuredClone(h);},clock:()=>({continuity,now}),time:async()=>{if(!fail)throw Error('unavailable time evidence');return undefined;}});
  await maintenance.tick(true);expect(maintenance.notice).toContain('reintentará');expect((await journal.inspect(accountId,true)).entries[0]!.state).toBe('pending');
  expect(maintenance.storageBlocked).toBe(true);expect(maintenance.notice).toContain('guardar');
  fail=false;continuity='resumed';now=0;await maintenance.tick(true);expect(writes).toBe(1);now+=5000;await maintenance.tick(true);
  expect(maintenance.storageBlocked).toBe(false);
  expect(maintenance.notice).toBeNull();expect(history.retention!.state).toBe('expired');expect(history.entries).toEqual([]);
  await expect(readFile(join(root,journalKey(accountId,operationId),'0000000001.json'))).rejects.toMatchObject({code:'ENOENT'});
  await expect(journal.create(entry)).rejects.toThrow('OPERATION_ID_REUSED');
 }finally{await rm(root,{recursive:true,force:true});}
});
it('retains unknown-age records and shares one in-flight cleanup without requiring connectivity',async()=>{
 const root=await mkdtemp(join(tmpdir(),'patron-maintenance-'));
 try{
  const journal=new OperationJournal(new DesktopJournalStorage(root)),accountId=randomUUID(),operationId=randomUUID(),requestId=randomUUID();
  const entry={accountId,operationId,requestHash:'a'.repeat(64),type:'test',state:'pending' as const,pause:true,retryLevel:1,deadline:null,status:'ready' as const,scopes:[]};await journal.create(entry);
  let history=closeHistory(pendingDeletion({accountId,phase:'active',entries:[entry]},requestId),{requestId,state:'deleted',confirmedAt:'2026-11-01T00:00:00Z',checkExpiresAt:'2027-01-30T00:00:00Z'},{continuity:'old',now:0});
  let release!:()=>void;const gate=new Promise<void>(r=>{release=r;});let reads=0;
  const maintenance=new HistoryMaintenance(journal,{load:async()=>{reads++;await gate;return history;},save:async h=>{history=structuredClone(h);},clock:()=>({continuity:'new',now:0}),time:async()=>undefined});
  const first=maintenance.tick(true);expect(maintenance.tick(true)).toBe(first);release();await first;expect(reads).toBe(1);expect(history.retention!.state).toBe('uncertain');expect(history.entries).toHaveLength(1);expect(history.entries[0]!.state).toBe('closed');
 }finally{await rm(root,{recursive:true,force:true});}
});
it('T061 retries related cleanup only after durable expiry, offline and without restarting retention',async()=>{
 const root=await mkdtemp(join(tmpdir(),'patron-maintenance-'));try{
  const journal=new OperationJournal(new DesktopJournalStorage(root)),accountId=randomUUID(),requestId=randomUUID();let now=0,calls=0,fail=true;
  let history=closeHistory(pendingDeletion({accountId,phase:'active',entries:[]},requestId),{requestId,state:'deleted',confirmedAt:'2026-11-01T00:00:00Z',checkExpiresAt:'2027-01-30T00:00:00Z'},{continuity:'boot',now:0});
  const maintenance=new HistoryMaintenance(journal,{load:async()=>history,save:async h=>{history=h;},clock:()=>({continuity:'boot',now}),time:async()=>undefined,cleanupRelated:async id=>{expect(id).toBe(accountId);expect(history.retention!.state).toBe('expired');calls++;if(fail)throw Error('occupied');}});
  await maintenance.tick(true);expect(calls).toBe(0);now=30*86400000;await maintenance.tick(true);expect(calls).toBe(1);expect(maintenance.notice).toContain('limpieza');
  fail=false;await maintenance.tick(true);expect(calls).toBe(1);now+=5000;await maintenance.tick(true);expect(calls).toBe(2);expect(maintenance.notice).toBeNull();
 }finally{await rm(root,{recursive:true,force:true});}
});
