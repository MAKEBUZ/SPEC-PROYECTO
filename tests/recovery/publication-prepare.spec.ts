import {it,expect} from 'vitest';
import {mkdtemp,rm,writeFile,readFile,copyFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {documentHandlers} from '../../apps/desktop/src/main/documents/document-handlers.js';
import {DocumentWriter,type ReplacementAdapter} from '../../apps/desktop/src/main/documents/save.js';
import {CapabilityRegistry} from '../../apps/desktop/src/main/ipc-boundary.js';
import {IpcRouter} from '../../apps/desktop/src/main/ipc-router.js';
import {revisionId} from '../../packages/document/src/revision.js';
it('prepares only a saved capability and rejects cross-window, stale revision and external file changes',async()=>{
 const root=await mkdtemp(join(tmpdir(),'patron-publish-'));
 try{
  const path=join(root,'saved.patron'),doc={formatVersion:1,documentId:randomUUID(),revisionId:'0'.repeat(64),units:'mm',pieces:[],preparations:[]};doc.revisionId=revisionId(doc);await writeFile(path,JSON.stringify(doc));
  const registry=new CapabilityRegistry(),adapter:ReplacementAdapter={assertSupported:async()=>{},flush:async()=>{},create:async(d,t)=>{await copyFile(t,d,1);},replace:async(d,t,b)=>{await copyFile(d,b);await copyFile(t,d);}};
  let alter=false;const handlers=documentHandlers(1,registry,new DocumentWriter(join(root,'writes'),adapter),adapter,{open:async()=>path,save:async()=>path,overwrite:async()=>true},undefined,async()=>{if(alter)await writeFile(path,'externally replaced');return {wasm:await readFile('node_modules/@resvg/resvg-wasm/index_bg.wasm'),font:await readFile('.local/assets/NotoSans-Regular.ttf')};});
  const router=new IpcRouter(registry,handlers,()=>true),request=(method:string,fields:Record<string,unknown>={},owner=1)=>router.dispatch({requestId:randomUUID(),method,...fields},owner,'app','app',true);
  const opened=await request('document.open');if(opened.status!=='success')throw Error('open failed');const handle=(opened.data as {documentHandle:string}).documentHandle;
  const fields={documentHandle:handle,revisionId:doc.revisionId};
  const prepared=await request('publication.prepare',fields);expect(prepared).toMatchObject({status:'success',data:{manifest:{documentId:doc.documentId,localRevisionId:doc.revisionId}}});expect(JSON.stringify(prepared)).not.toContain(root);
  expect(await request('publication.prepare',fields,2)).toMatchObject({status:'error',error:{code:'ACCESS_DENIED'}});
  expect(await request('publication.prepare',{...fields,revisionId:'0'.repeat(64)})).toMatchObject({status:'error',error:{code:'DOCUMENT_INVALID'}});
  expect(await request('publication.prepare',{...fields,path})).toMatchObject({status:'error',error:{code:'ACCESS_DENIED'}});
  alter=true;expect(await request('publication.prepare',fields)).toMatchObject({status:'error',error:{code:'EXTERNAL_FILE_CHANGED'}});expect(await readFile(path,'utf8')).toBe('externally replaced');
 }finally{await rm(root,{recursive:true,force:true});}
});
