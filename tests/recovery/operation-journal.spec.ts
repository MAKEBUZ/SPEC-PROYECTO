import { it,expect } from 'vitest';
import { mkdtemp,rm,readFile,writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { OperationJournal,journalKey } from '../../packages/document/src/operations/journal.js';
import type { LocalOperation } from '../../packages/document/src/operations/journal.js';
import { DesktopJournalStorage } from '../../apps/desktop/src/main/operations/storage.js';
const operation=():LocalOperation=>({operationId:randomUUID(),accountId:randomUUID(),requestHash:'a'.repeat(64),type:'commitPublication',state:'pending',pause:false,retryLevel:0,deadline:null,status:'ready',scopes:[{kind:'pattern',id:randomUUID()}]});
it('persists transitions before exposing them, hides other accounts and preserves tombstones',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'patron-journal-'));
  try{const storage=new DesktopJournalStorage(dir),journal=new OperationJournal(storage),p=operation();await journal.create(p);
    expect((await journal.inspect(null,false)).entries).toEqual([]);expect((await journal.inspect(randomUUID(),true)).entries).toEqual([]);
    await journal.update(p.accountId,p.operationId,r=>({...r,pause:true}));const reopened=new OperationJournal(storage);expect((await reopened.inspect(p.accountId,true)).entries[0]!.pause).toBe(true);
    await expect(reopened.update(p.accountId,p.operationId,()=>null)).rejects.toThrow('PENDING_CANNOT_BE_REMOVED');
    await reopened.update(p.accountId,p.operationId,r=>({...r,state:'resolved',outcome:'success',confirmedAt:new Date(1000).toISOString(),receivedAt:1000}));
    await expect(reopened.update(p.accountId,p.operationId,r=>({...r,state:'pending'}))).rejects.toThrow();
    await reopened.update(p.accountId,p.operationId,()=>null);expect((await reopened.inspect(p.accountId,true)).entries).toEqual([]);await expect(reopened.create(p)).rejects.toThrow('OPERATION_ID_REUSED');
  }finally{await rm(dir,{recursive:true,force:true});}
});
it('isolates a corrupt later generation instead of resurrecting an older pending state',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'patron-journal-'));
  try{const store=new DesktopJournalStorage(dir),journal=new OperationJournal(store),p=operation();await journal.create(p);await journal.update(p.accountId,p.operationId,r=>({...r,pause:true}));
    const file=join(dir,journalKey(p.accountId,p.operationId),'0000000002.json');await writeFile(file,(await readFile(file,'utf8')).slice(0,20));
    expect((await journal.inspect(p.accountId,true)).entries[0]!.pause).toBe(true);
    await writeFile(join(dir,journalKey(p.accountId,p.operationId),'.copies','0000000002.json'),'broken backup');
    expect(await journal.inspect(p.accountId,true)).toEqual({entries:[],damaged:true});expect(await journal.inspect(null,false)).toEqual({entries:[],damaged:false});
    await expect(journal.update(p.accountId,p.operationId,r=>({...r,pause:false}))).rejects.toThrow();
  }finally{await rm(dir,{recursive:true,force:true});}
});
it('rejects stale compare-and-append writers and does not acknowledge failed storage',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'patron-journal-'));
  try{const store=new DesktopJournalStorage(dir),journal=new OperationJournal(store),p=operation();await journal.create(p);const key=journalKey(p.accountId,p.operationId),old=await store.read(key);
    await journal.update(p.accountId,p.operationId,r=>({...r,pause:true}));await expect(store.append(key,old,'invalid')).rejects.toThrow('JOURNAL_CONFLICT');
    const failing=new OperationJournal({keys:()=>store.keys(),read:k=>store.read(k),append:async()=>{throw new Error('DISK_FULL');}});
    await expect(failing.update(p.accountId,p.operationId,r=>({...r,pause:false}))).rejects.toThrow('DISK_FULL');expect((await journal.inspect(p.accountId,true)).entries[0]!.pause).toBe(true);
  }finally{await rm(dir,{recursive:true,force:true});}
});
