import { it,expect } from 'vitest';
import { mkdtemp,rm,readFile,mkdir,writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { OperationJournal,journalKey } from '../../packages/document/src/operations/journal.js';
import { DesktopJournalStorage } from '../../apps/desktop/src/main/operations/storage.js';
it('physically removes old generations and keeps later deletion evidence above restored old copies',async()=>{
 const root=await mkdtemp(join(tmpdir(),'patron-compact-'));
 try{
  const storage=new DesktopJournalStorage(root),journal=new OperationJournal(storage),accountId=randomUUID(),operationId=randomUUID(),key=journalKey(accountId,operationId);
  const op={accountId,operationId,requestHash:'a'.repeat(64),type:'commitPublication',state:'pending' as const,pause:false,retryLevel:0,deadline:null,status:'ready' as const,scopes:[]};await journal.create(op);
  await expect(journal.compact(accountId,operationId)).rejects.toThrow('FORBIDDEN');
  const old=await storage.read(key);
  await journal.update(accountId,operationId,r=>({...r,state:'closed',closedAt:0}));await journal.update(accountId,operationId,()=>null);
  await journal.compact(accountId,operationId);await expect(readFile(join(root,key,'0000000001.json'))).rejects.toMatchObject({code:'ENOENT'});
  await expect(journal.create(op)).rejects.toThrow('OPERATION_ID_REUSED');
  await mkdir(join(root,key));await writeFile(join(root,key,'0000000001.json'),old[0]!);
  expect((await new OperationJournal(storage).inspect(accountId,true)).entries).toEqual([]);
  await journal.compact(accountId,operationId);await expect(readFile(join(root,key,'0000000001.json'))).rejects.toMatchObject({code:'ENOENT'});
 }finally{await rm(root,{recursive:true,force:true});}
});
