import { it,expect } from 'vitest';
import { mkdtemp,writeFile,readFile,rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { RecoveryStore } from '../../apps/desktop/src/main/documents/recovery.js';
const doc={formatVersion:1 as const,documentId:'80000000-0000-4000-8000-000000000001',revisionId:'0'.repeat(64),units:'mm' as const,pieces:[],preparations:[]};
it('recovers new unsaved documents explicitly without writing an original',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'patron-recovery-')),store=new RecoveryStore(dir),id=await store.capture(doc);
  await expect(store.restore(id,false)).rejects.toThrow();expect(await store.restore(id,true)).toEqual(doc);
  const reopened=new RecoveryStore(dir);expect((await reopened.inspect()).candidates).toHaveLength(1);
  await reopened.discard(id,true);expect((await new RecoveryStore(dir).inspect()).candidates).toEqual([]);
});
it('does not resurrect an earlier snapshot when later discard evidence is corrupt',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'patron-recovery-')),store=new RecoveryStore(dir);await store.capture(doc);
  await writeFile(join(dir,`${doc.documentId}-80000000-0000-4000-8000-000000000002.recovery.json`),'corrupt');
  expect(await store.inspect()).toEqual({candidates:[],damaged:true});await expect(store.capture(doc)).rejects.toThrow('RECOVERY_INVALID');
});
it('does not discard a newer recovery through a stale confirmation',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'patron-recovery-stale-'));
  try{
    const store=new RecoveryStore(dir),old=await store.capture(doc),latest=await store.capture(doc);
    await expect(store.discard(old,true)).rejects.toThrow('RECOVERY_INVALID');
    expect((await store.inspect()).candidates.map(c=>c.id)).toEqual([latest]);
    await store.discard(latest,true);await expect(store.discard(latest,true)).rejects.toThrow('RECOVERY_INVALID');
  }finally{await rm(dir,{recursive:true,force:true});}
});
it.each(['missing','duplicate'] as const)('isolates a %s generation and refuses subsequent capture',async kind=>{
  const dir=await mkdtemp(join(tmpdir(),'patron-recovery-chain-'));
  try{
    const store=new RecoveryStore(dir),first=await store.capture(doc);await store.capture(doc);
    if(kind==='missing')await rm(join(dir,first));
    else await writeFile(join(dir,`${doc.documentId}-80000000-0000-4000-8000-000000000003.recovery.json`),await readFile(join(dir,first)));
    expect(await store.inspect()).toEqual({candidates:[],damaged:true});
    await expect(store.capture(doc)).rejects.toThrow('RECOVERY_INVALID');
  }finally{await rm(dir,{recursive:true,force:true});}
});
