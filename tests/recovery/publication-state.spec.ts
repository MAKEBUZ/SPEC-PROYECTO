import {it,expect} from 'vitest';
import {mkdtemp,rm,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {PublicationStateStore} from '../../apps/desktop/src/main/publication/state-store.js';
import {DesktopJournalStorage} from '../../apps/desktop/src/main/operations/storage.js';
it('recovers persisted correlation across instances and never falls back through damaged generations',async()=>{
 const root=await mkdtemp(join(tmpdir(),'publication-state-'));try{
 const accountId=randomUUID(),documentId=randomUUID(),store=new PublicationStateStore(new DesktopJournalStorage(root));
 const state=await store.load(accountId,documentId);state.project={operationId:randomUUID(),name:'Proyecto'};await store.save(state);
 expect(await new PublicationStateStore(new DesktopJournalStorage(root)).load(accountId,documentId)).toEqual(state);
 const key=`${accountId}_${documentId}`,primary=join(root,key,'0000000001.json'),backup=join(root,key,'.copies','0000000001.json');await writeFile(primary,'damaged');expect((await store.load(accountId,documentId)).project).toEqual(state.project);
 await writeFile(backup,'also damaged');await expect(store.load(accountId,documentId)).rejects.toThrow();
 expect(await readFile(primary,'utf8')).toBe('damaged');
 }finally{await rm(root,{recursive:true,force:true});}
});
it('T061 retires publication correlation and recovery copies without touching another account',async()=>{
 const root=await mkdtemp(join(tmpdir(),'publication-retire-'));try{
  const store=new PublicationStateStore(new DesktopJournalStorage(root)),accountId=randomUUID(),documentId=randomUUID(),other=randomUUID();
  await store.save({accountId,documentId,project:{operationId:randomUUID(),name:'Retired project'}});await store.save({accountId:other,documentId});
  await store.retireAccount(accountId);await expect(store.load(accountId,documentId)).rejects.toThrow('PUBLICATION_ACCOUNT_CLOSED');
  await expect(store.save({accountId,documentId})).rejects.toThrow('PUBLICATION_ACCOUNT_CLOSED');expect(await store.load(other,documentId)).toEqual({accountId:other,documentId});
  await expect(readFile(join(root,`${accountId}_${documentId}`,'.copies','0000000001.json'))).rejects.toMatchObject({code:'ENOENT'});
  await new PublicationStateStore(new DesktopJournalStorage(root)).retireAccount(accountId);
 }finally{await rm(root,{recursive:true,force:true});}
});
