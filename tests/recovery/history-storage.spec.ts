import {it,expect} from 'vitest';
import {mkdtemp,rm,writeFile,readFile,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {DesktopHistoryStorage} from '../../apps/desktop/src/main/operations/history-storage.js';
import {closeHistory,pendingDeletion,type AccountHistory} from '../../packages/document/src/operations/closed.js';
import {HistoryMaintenance} from '../../packages/document/src/operations/maintenance.js';
import {OperationJournal} from '../../packages/document/src/operations/journal.js';
import {DesktopJournalStorage} from '../../apps/desktop/src/main/operations/storage.js';
import {exclusiveWrite} from '../../apps/desktop/src/main/documents/save.js';

it('recovers the exact committed backup, isolates unrecoverable damage and preserves other accounts',async()=>{
 const root=await mkdtemp(join(tmpdir(),'history-store-'));try{
  const id=randomUUID(),other=randomUUID(),store=new DesktopHistoryStorage(root,id);
  const initial:AccountHistory={accountId:id,phase:'active',entries:[]};await store.save(initial);
  await new DesktopHistoryStorage(root,other).save({accountId:other,phase:'active',entries:[]});
  const folder=join(root,id,'000000000001');await writeFile(join(folder,'primary.json'),'damaged');
  expect(await new DesktopHistoryStorage(root,id).load()).toEqual(initial);
  await writeFile(join(folder,'backup.json'),'damaged too');
  await expect(store.load()).rejects.toThrow('HISTORY_RECOVERY_UNAVAILABLE');
  expect(store.notice).not.toBeNull();
  await expect(store.save(initial)).rejects.toThrow('HISTORY_RECOVERY_UNAVAILABLE');
  expect((await new DesktopHistoryStorage(root,other).load()).accountId).toBe(other);
 }finally{await rm(root,{recursive:true,force:true});}
});
it('retries a partial write only from the exact retained in-memory snapshot',async()=>{
 const root=await mkdtemp(join(tmpdir(),'history-partial-'));try{
  const id=randomUUID();let fail=true;
  const store=new DesktopHistoryStorage(root,id,async(path,bytes)=>{if(fail&&path.endsWith('primary.json')){fail=false;await writeFile(path,'partial');throw Error('DISK_FULL');}await exclusiveWrite(path,bytes);});
  const state:AccountHistory={accountId:id,phase:'active',entries:[]};await expect(store.save(state)).rejects.toThrow('DISK_FULL');
  await expect(new DesktopHistoryStorage(root,id).load()).rejects.toThrow('HISTORY_RECOVERY_UNAVAILABLE');
  await expect(store.save(pendingDeletion(state,randomUUID()))).rejects.toThrow('HISTORY_RECOVERY_UNAVAILABLE');
  await store.save(state);expect(await store.load()).toEqual(state);
 }finally{await rm(root,{recursive:true,force:true});}
});
it('reopens durable deletion state and completes physical cleanup without time evidence or a session',async()=>{
 const root=await mkdtemp(join(tmpdir(),'history-maintenance-real-'));try{
  const id=randomUUID(),requestId=randomUUID(),entry={accountId:id,operationId:randomUUID(),requestHash:'a'.repeat(64),type:'test',state:'pending' as const,pause:true,retryLevel:0,deadline:null,status:'ready' as const,scopes:[]};
  const journal=new OperationJournal(new DesktopJournalStorage(join(root,'operations')));await journal.create(entry);
  const history=closeHistory(pendingDeletion({accountId:id,phase:'active',entries:[entry]},requestId),{requestId,state:'deleted',confirmedAt:'2026-11-01T00:00:00Z',checkExpiresAt:'2027-01-30T00:00:00Z'},{continuity:'boot',now:0});history.retention!.state='expired';
  await new DesktopHistoryStorage(join(root,'histories'),id).save(history);
  const reopened=new DesktopHistoryStorage(join(root,'histories'),id);
  const maintenance=new HistoryMaintenance(journal,{load:()=>reopened.load(),save:h=>reopened.save(h),clock:()=>({continuity:'new boot',now:0}),time:async()=>{throw Error('must not consult');}});
  await maintenance.tick(true);expect(maintenance.notice).toBeNull();expect((await reopened.load()).entries).toEqual([]);
  await expect(journal.create(entry)).rejects.toThrow('OPERATION_ID_REUSED');
  await expect(reopened.save(history)).rejects.toThrow('HISTORY_ROLLBACK');
  expect(await readdir(join(root,'operations'))).toEqual(['.retired']);
 }finally{await rm(root,{recursive:true,force:true});}
});
it('retains confirmed expiry across reopen, removes earlier snapshots and rejects resurrection',async()=>{
 const root=await mkdtemp(join(tmpdir(),'history-store-'));try{
  const id=randomUUID(),requestId=randomUUID(),store=new DesktopHistoryStorage(root,id);
  const original:AccountHistory={accountId:id,phase:'active',entries:[]};await store.save(original);
  const closed=closeHistory(pendingDeletion(original,requestId),{requestId,state:'deleted',confirmedAt:'2026-11-01T00:00:00Z',checkExpiresAt:'2027-01-30T00:00:00Z'},{continuity:'boot',now:0});
  closed.retention!.state='expired';await store.save(closed);
  expect(await readdir(join(root,id))).toEqual(['000000000002']);
  expect((await new DesktopHistoryStorage(root,id).load()).retention!.state).toBe('expired');
  await expect(store.save({...closed,retention:{...closed.retention!,state:'valid'}})).rejects.toThrow('HISTORY_ROLLBACK');
  await expect(store.save(original)).rejects.toThrow('HISTORY_ROLLBACK');
  const latest=join(root,id,'000000000002');await writeFile(join(latest,'primary.json'),'broken');
  expect((await store.load()).retention!.state).toBe('expired');
  expect(await readFile(join(latest,'backup.json'),'utf8')).toContain('expired');
 }finally{await rm(root,{recursive:true,force:true});}
});
