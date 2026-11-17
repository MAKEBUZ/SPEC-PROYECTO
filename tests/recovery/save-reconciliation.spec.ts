import { it,expect } from 'vitest';
import { mkdtemp,rm,readFile,writeFile,readdir,copyFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { DocumentWriter,type ReplacementAdapter } from '../../apps/desktop/src/main/documents/save.js';
import { SaveJournal } from '../../apps/desktop/src/main/documents/save-journal.js';
import { recoveryHandlers } from '../../apps/desktop/src/main/documents/recovery-handlers.js';
import { RecoveryStore } from '../../apps/desktop/src/main/documents/recovery.js';
import { CapabilityRegistry } from '../../apps/desktop/src/main/ipc-boundary.js';
import { IpcRouter } from '../../apps/desktop/src/main/ipc-router.js';
const doc=()=>({formatVersion:1 as const,documentId:randomUUID(),revisionId:'0'.repeat(64),units:'mm' as const,pieces:[],preparations:[]});
const adapter=():ReplacementAdapter=>({assertSupported:async()=>{},volume:async()=> 'volume-a',create:async(d,t)=>copyFile(t,d,1),replace:async(d,t,b)=>{await copyFile(d,b);await copyFile(t,d);},flush:async()=>{}});
it.each(['before','after'])('reconciles %s replacement after restart without writing the target',async stage=>{
 const root=await mkdtemp(join(tmpdir(),'patron-reconcile-'));
 try{
  const path=join(root,'file.patron'),directory=join(root,'journal'),a=adapter(),writer=new DocumentWriter(directory,a);
  const old=await writer.save({path,snapshot:doc(),expected:null}),next=doc();
  if(stage==='before')a.replace=async()=>{throw Error('interrupted');};else a.flush=async()=>{throw Error('interrupted');};
  await expect(writer.save({path,snapshot:next,expected:old.identity})).rejects.toThrow();
  const bytes=await readFile(path),journal=new SaveJournal(directory,a),result=await journal.inspect();
  expect(result.damaged).toBe(false);expect(result.candidates.some(c=>c.snapshot.documentId===next.documentId)).toBe(true);
  expect(result.candidates.find(c=>c.snapshot.documentId===next.documentId)?.state).toBe(stage==='after'?'destination-verified':'unconfirmed');
  expect(await readFile(path)).toEqual(bytes);
  const candidate=result.candidates.find(c=>c.snapshot.documentId===next.documentId)!;
  await expect(journal.restore(candidate.id,false)).rejects.toThrow();
  expect((await journal.restore(candidate.id,true)).documentId).toBe(next.documentId);
  await journal.discard(candidate.id,true);expect((await new SaveJournal(directory,a).inspect()).candidates.some(c=>c.id===candidate.id)).toBe(false);
 }finally{await rm(root,{recursive:true,force:true});}
});
it('blocks replacement when a volume changes during save and retains an independent recovery through IPC',async()=>{
 const root=await mkdtemp(join(tmpdir(),'patron-swap-'));
 try{
  const a=adapter(),path=join(root,'file.patron'),directory=join(root,'journal');let calls=0,replaced=false;
  a.volume=async()=>++calls===1?'original':'replacement';a.create=async()=>{replaced=true;};
  const snapshot=doc();await expect(new DocumentWriter(directory,a).save({path,snapshot,expected:null})).rejects.toThrow('STORAGE_UNAVAILABLE');expect(replaced).toBe(false);
  const registry=new CapabilityRegistry(),router=new IpcRouter(registry,recoveryHandlers(new RecoveryStore(join(root,'auto')),registry,1,new SaveJournal(directory,a)),()=>true);
  const request=(method:string,fields:Record<string,unknown>={})=>router.dispatch({method,requestId:randomUUID(),...fields},1,'local','local',true);
  const inspected=await request('recovery.inspect');if(inspected.status!=='success')throw Error();
  expect(JSON.stringify(inspected.data)).not.toContain(root);
  const id=(inspected.data as {candidates:{recoveryId:string}[]}).candidates[0]!.recoveryId;
  expect(await request('recovery.restore',{recoveryId:id,confirmed:true})).toMatchObject({status:'success',data:{saved:false,snapshot:{documentId:snapshot.documentId}}});
 }finally{await rm(root,{recursive:true,force:true});}
});
it('uses another verified candidate when the independent copy is damaged, and rejects a damaged confirmation',async()=>{
 const root=await mkdtemp(join(tmpdir(),'patron-candidates-'));
 try{
  const a=adapter(),directory=join(root,'journal'),path=join(root,'file.patron');a.flush=async()=>{throw Error('interrupted');};
  await expect(new DocumentWriter(directory,a).save({path,snapshot:doc(),expected:null})).rejects.toThrow();
  const next=(await readdir(directory)).find(p=>p.endsWith('.next.patron'))!;await writeFile(join(directory,next),'broken');
  const journal=new SaveJournal(directory,a);expect((await journal.inspect()).candidates).toHaveLength(1);
  const saveId=next.slice(0,-'.next.patron'.length);await writeFile(join(directory,`${saveId}.confirmed.json`),'broken');
  expect(await journal.inspect()).toMatchObject({damaged:true,candidates:[]});
 }finally{await rm(root,{recursive:true,force:true});}
});
it('keeps independent candidates when the destination volume changes and never trusts old paths',async()=>{
 const root=await mkdtemp(join(tmpdir(),'patron-volume-'));
 try{
  const directory=join(root,'journal'),path=join(root,'file.patron'),a=adapter();a.create=async()=>{throw Error('unplugged');};
  await expect(new DocumentWriter(directory,a).save({path,snapshot:doc(),expected:null})).rejects.toThrow();
  a.volume=async()=> 'another-volume';
  const result=await new SaveJournal(directory,a).inspect();expect(result.candidates).toHaveLength(1);expect(result.candidates[0]!.state).toBe('unavailable');
  const intent=(await readdir(directory)).find(p=>p.endsWith('.intent.json'))!;
  await writeFile(join(directory,intent),'broken');
  const damaged=await new SaveJournal(directory,a).inspect();expect(damaged.damaged).toBe(true);expect(damaged.candidates).toHaveLength(0);
 }finally{await rm(root,{recursive:true,force:true});}
});
