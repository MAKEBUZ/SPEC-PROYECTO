import {readFile} from 'node:fs/promises';
import {basename} from 'node:path';
import type {LocalHandlers} from '../ipc-router.js';
import type {CapabilityRegistry} from '../ipc-boundary.js';
import {identity,type FileIdentity,type ReplacementAdapter} from '../documents/save.js';
import {parseDocument} from '../../../../../packages/document/src/schema.js';
import {savedPdfOrigin} from '../../../../../packages/document/src/pdf-artifact.js';
import {ExportJob} from './export-job.js';
import {saveVerifiedPdf} from './save-pdf.js';
import type {PdfArtifactStore} from '../publication/pdf-artifact-store.js';
interface Binding {documentId:string;revisionId:string;path:string|null;identity:FileIdentity|null}
interface State {state:string;error?:string;name?:string}
interface Entry {job:ExportJob|undefined;state:State;sequence:number;cancelled:boolean;done:Promise<void>;verification:AbortController}
const update=(entry:Entry,state:State)=>{entry.state=state;entry.sequence++;};
const status=(entry:Entry)=>({...entry.state,sequence:entry.sequence});
export function exportHandlers(owner:number,registry:CapabilityRegistry,adapter:ReplacementAdapter,font:()=>Promise<Uint8Array>,choose:()=>Promise<string|null>,confirmSave:()=>Promise<boolean>,catalog?:PdfArtifactStore){
 let starting=false,active:Entry|undefined;
 const handlers:LocalHandlers={
  'export.confirmSave':async r=>({requestId:r.requestId,status:'success',data:{confirmed:await confirmSave()}}),
  'export.generate':async r=>{
   if(starting||active)return {requestId:r.requestId,status:'error',error:{code:'EXPORT_BUSY',message:'Ya hay una exportación en curso.'}};
   starting=true;
   try{
    const binding=registry.resolve(String(r.documentHandle),owner,'document') as Binding;
    if(!binding.path||!binding.identity||binding.revisionId!==r.revisionId)throw Error('Guarda el documento antes de exportar.');
    const path=binding.path,expected=JSON.stringify(binding.identity);await adapter.assertSupported(path);
    if(JSON.stringify(await identity(path))!==expected)throw Error('El archivo guardado cambió. Ábrelo de nuevo antes de exportar.');
    const snapshot=await readFile(path),document=parseDocument(snapshot.toString('utf8'));savedPdfOrigin(document,String(r.preparationId));
    if(document.documentId!==binding.documentId||document.revisionId!==r.revisionId||JSON.stringify(await identity(path))!==expected)throw Error('La revisión guardada cambió.');
    const destination=await choose();if(!destination)return {requestId:r.requestId,status:'cancelled'};
    await adapter.assertSupported(destination);const previous=await identity(destination);
    // Never overwrite the editable file, including an alias with another suffix.
    if(previous&&previous.device===binding.identity.device&&previous.inode===binding.identity.inode)throw Error('El destino no puede ser el documento editable.');
    const job=new ExportJob(snapshot,String(r.preparationId),await font());
    const entry:Entry={job,state:{state:'generating'},sequence:0,cancelled:false,done:Promise.resolve(),verification:new AbortController()};active=entry;
    job.subscribe(p=>{update(entry,p);});
    const jobId=registry.issue(owner,'job',entry);
    entry.done=(async()=>{
     try{
      const verified=await job.finished;if(!verified||entry.cancelled){if(entry.cancelled)update(entry,{state:'cancelled'});return;}
      update(entry,{state:'saving'});
      const saved=await saveVerifiedPdf(destination,verified.bytes,previous,adapter,()=>entry.cancelled);
      update(entry,saved?{state:'completed',name:basename(destination)}:{state:'cancelled'});
      if(saved&&catalog){
       update(entry,{state:'registering'});
       try{await catalog.persistExport(snapshot,String(r.preparationId),verified,entry.verification.signal);update(entry,{state:'completed',name:basename(destination)});}
       catch{update(entry,{state:'completed',name:basename(destination),error:'El PDF está guardado; el registro para publicarlo no se completó. Vuelve a exportarlo para registrar esta revisión.'});}
      }
     }catch(e){update(entry,{state:'failed',error:e instanceof Error?e.message:'No se pudo guardar el PDF.'});}
     finally{entry.job=undefined;if(active===entry)active=undefined;}
    })();
    return {requestId:r.requestId,status:'success',data:{jobId}};
   }catch(e){return {requestId:r.requestId,status:'error',error:{code:'PDF_EXPORT_FAILED',message:e instanceof Error?e.message:'No se pudo iniciar la exportación.'}};}
   finally{starting=false;}
  },
  'export.status':async r=>({requestId:r.requestId,status:'success',data:status(registry.resolve(String(r.jobId),owner,'job') as Entry)}),
  'export.cancel':async r=>{
   const entry=registry.resolve(String(r.jobId),owner,'job') as Entry;
   if(!['completed','failed','cancelled'].includes(entry.state.state)){entry.cancelled=true;entry.verification.abort();update(entry,{state:'cancelling'});await entry.job?.cancel();await entry.done;}
   return {requestId:r.requestId,status:'success',data:status(entry)};
  }
 };
 return {handlers,dispose:async()=>{if(active){const entry=active;entry.cancelled=true;entry.verification.abort();await entry.job?.cancel();await entry.done;}}};
}
