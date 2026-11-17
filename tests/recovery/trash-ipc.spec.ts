import { it,expect } from 'vitest';
import { mkdtemp,rm,readFile,rename } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join,resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DocumentWriter } from '../../apps/desktop/src/main/documents/save.js';
import { windowsAdapter } from '../../apps/desktop/src/main/documents/windows-adapter.js';
import { documentHandlers } from '../../apps/desktop/src/main/documents/document-handlers.js';
import { CapabilityRegistry } from '../../apps/desktop/src/main/ipc-boundary.js';
import { IpcRouter } from '../../apps/desktop/src/main/ipc-router.js';
it('requires a fresh main confirmation, preserves failed trash and consumes the approval',async()=>{
 const root=await mkdtemp(join(tmpdir(),'patron-trash-ipc-'));
 try{
  const path=join(root,'file.patron'),adapter=windowsAdapter(resolve('apps/desktop/native/build/Release/file_replace.node')),writer=new DocumentWriter(join(root,'journal'),adapter);
  await writer.save({path,expected:null,snapshot:{formatVersion:1,documentId:randomUUID(),revisionId:'0'.repeat(64),units:'mm',pieces:[],preparations:[]}});
  const bytes=await readFile(path),registry=new CapabilityRegistry();let fail=true,calls=0;
  const router=new IpcRouter(registry,documentHandlers(1,registry,writer,adapter,{open:async()=>path,save:async()=>path,overwrite:async()=>true,confirmTrash:async()=> 'trash'},async file=>{calls++;if(fail)throw Error('Recycle bin unavailable');await rename(file,join(root,'recycled.patron'));}),()=>true);
  const request=(method:string,fields:Record<string,unknown>={})=>router.dispatch({method,requestId:randomUUID(),...fields},1,'local','local',true);
  const opened=await request('document.open');if(opened.status!=='success')throw Error();const {documentHandle}=opened.data as {documentHandle:string};
  expect(await request('document.trash',{documentHandle,confirmed:true,confirmationId:randomUUID()})).toMatchObject({status:'error'});expect(calls).toBe(0);
  const confirm=async()=>{const r=await request('document.confirmTrash',{documentHandle,dirty:false});if(r.status!=='success')throw Error();return (r.data as {confirmationId:string}).confirmationId;};
  const first=await confirm();expect(await request('document.trash',{documentHandle,confirmed:true,confirmationId:first})).toMatchObject({status:'error',error:{code:'TRASH_UNAVAILABLE'}});expect(await readFile(path)).toEqual(bytes);
  fail=false;expect(await request('document.trash',{documentHandle,confirmed:true,confirmationId:first})).toMatchObject({status:'error'});expect(calls).toBe(1);
  expect(await request('document.trash',{documentHandle,confirmed:true,confirmationId:await confirm()})).toMatchObject({status:'success'});expect(await readFile(join(root,'recycled.patron'))).toEqual(bytes);
 }finally{await rm(root,{recursive:true,force:true});}
});
