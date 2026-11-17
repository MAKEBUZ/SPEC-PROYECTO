import { it,expect } from 'vitest';
import { mkdtemp,rm,copyFile,writeFile,readFile,link } from 'node:fs/promises';
import { join,resolve } from 'node:path';
import { windowsAdapter } from '../../apps/desktop/src/main/documents/windows-adapter.js';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { documentHandlers } from '../../apps/desktop/src/main/documents/document-handlers.js';
import { DocumentWriter,type ReplacementAdapter } from '../../apps/desktop/src/main/documents/save.js';
import { CapabilityRegistry } from '../../apps/desktop/src/main/ipc-boundary.js';
import { IpcRouter } from '../../apps/desktop/src/main/ipc-router.js';
import type { PatternDocument } from '../../packages/document/src/schema.js';
it('connects native dialog selections to verified save/open and blocks direct SaveAs over external changes',async()=>{
  const root=await mkdtemp(join(tmpdir(),'patron-files-ipc-'));
  try{
    const adapter:ReplacementAdapter=process.env.PATRON_NATIVE_TEST==='1'?windowsAdapter(resolve('apps/desktop/native/build/Release/file_replace.node')):{assertSupported:async()=>{},flush:async()=>{},create:async(d,t)=>{await copyFile(t,d,1);},replace:async(d,t,b)=>{await copyFile(d,b);await copyFile(t,d);}};
    let destination:string|null=join(root,'first.patron');
    const registry=new CapabilityRegistry(),router=new IpcRouter(registry,documentHandlers(1,registry,new DocumentWriter(join(root,'journal'),adapter),adapter,{open:async()=>destination,save:async()=>destination,overwrite:async()=>true}),()=>true);
    const request=(method:string,fields:Record<string,unknown>={})=>router.dispatch({method,requestId:randomUUID(),...fields},1,'local','local',true);
    const doc:PatternDocument={formatVersion:1,documentId:randomUUID(),revisionId:'0'.repeat(64),units:'mm',pieces:[],preparations:[]};
    const registered=await request('document.register',{documentId:doc.documentId});if(registered.status!=='success')throw Error();const handle=(registered.data as {documentHandle:string}).documentHandle;
    const saved=await request('document.save',{documentHandle:handle,snapshot:doc,revisionId:doc.revisionId,mode:'save'});if(saved.status!=='success')throw Error();
    const snapshot=(saved.data as {snapshot:PatternDocument}).snapshot;
    expect(await request('document.open')).toMatchObject({status:'success',data:{snapshot,saved:true}});
    const original=destination;await writeFile(original,'changed externally');
    expect(await request('document.save',{documentHandle:handle,snapshot,revisionId:snapshot.revisionId,mode:'saveAs'})).toMatchObject({status:'error',error:{code:'EXTERNAL_FILE_CHANGED'}});
    expect(await readFile(original,'utf8')).toBe('changed externally');
    destination=join(root,'alias.patron');await link(original,destination);
    expect(await request('document.save',{documentHandle:handle,snapshot,revisionId:snapshot.revisionId,mode:'saveAs'})).toMatchObject({status:'error',error:{code:'EXTERNAL_FILE_CHANGED'}});
    destination=join(root,'other.patron');
    expect(await request('document.save',{documentHandle:handle,snapshot,revisionId:snapshot.revisionId,mode:'saveAs'})).toMatchObject({status:'success'});
    expect(await readFile(original,'utf8')).toBe('changed externally');
    destination=null;expect(await request('document.open')).toMatchObject({status:'cancelled'});
    destination=join(root,'future.patron');await writeFile(destination,JSON.stringify({...doc,formatVersion:2}));
    expect(await request('document.open')).toMatchObject({status:'error',error:{code:'FORMAT_UNSUPPORTED'}});
  }finally{await rm(root,{recursive:true,force:true});}
});
