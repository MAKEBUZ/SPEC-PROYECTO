import { basename } from 'node:path';
import type { LocalHandlers } from '../ipc-router.js';
import { CapabilityRegistry } from '../ipc-boundary.js';
import { validateDocument } from '../../../../../packages/document/src/schema.js';
import type {PatternDocument} from '../../../../../packages/document/src/schema.js';
import { uuid,ValidationError } from '../../../../../packages/contracts/src/validation.js';
import { DocumentWriter,identity,LocalDocumentError,type FileIdentity,type ReplacementAdapter } from './save.js';
import { openDocument } from './open.js';
import { randomUUID } from 'node:crypto';
import { LocalDocumentTrash,type TrashChoice } from './trash.js';
import {readFile} from 'node:fs/promises';
import {preparePublication} from '../publication/bundle.js';
import type {RenderAssets} from '../../../../../packages/print/src/profile.js';
import type {PublicationRuntime} from '../publication/runtime.js';
import type {PublicationConflictInfo} from '../publication/runtime.js';
import {ConflictResolver,independentPattern,remoteConflictPolicy} from '../publication/conflicts.js';
import {revisionId} from '../../../../../packages/document/src/revision.js';
import type {PdfArtifactStore} from '../publication/pdf-artifact-store.js';
export interface DocumentDialogs {open():Promise<string|null>;save(currentPath?:string):Promise<string|null>;overwrite(name:string):Promise<boolean>;confirmTrash?(name:string,dirty:boolean):Promise<TrashChoice>}
interface Binding {documentId:string;revisionId:string;path:string|null;identity:FileIdentity|null;remoteBinding?:PatternDocument['remoteBinding'];blockedPath?:string;trashApproval?:{id:string;path:string}}
export function documentHandlers(owner:number,registry:CapabilityRegistry,writer:DocumentWriter,adapter:ReplacementAdapter,dialogs:DocumentDialogs,trashItem?:(path:string)=>Promise<void>,assets?:()=>Promise<RenderAssets>,publication?:PublicationRuntime,conflictBackups?:string,pdfCatalog?:PdfArtifactStore):LocalHandlers{
  let busy=false;
  const resolutions=new Map<string,PublicationConflictInfo>();
  const bundleFor=async(handle:string,revision:unknown,pdfIds:readonly string[]=[])=>{
    const binding=registry.resolve(handle,owner,'document') as Binding;
    if(!assets||!binding.path||!binding.identity||binding.revisionId!==revision)throw new LocalDocumentError('DOCUMENT_INVALID');
    await adapter.assertSupported(binding.path);const expected=JSON.stringify(binding.identity);
    if(JSON.stringify(await identity(binding.path))!==expected)throw new LocalDocumentError('EXTERNAL_FILE_CHANGED');
    if(pdfIds.length&&!pdfCatalog)throw Error('PDF_CATALOG_UNAVAILABLE');
    const bundle=await preparePublication(await readFile(binding.path),basename(binding.path),await assets(),pdfCatalog?{store:pdfCatalog,ids:pdfIds}:undefined);
    if(bundle.document.documentId!==binding.documentId||bundle.document.revisionId!==binding.revisionId)throw new LocalDocumentError('DOCUMENT_INVALID');
    if(JSON.stringify(await identity(binding.path))!==expected)throw new LocalDocumentError('EXTERNAL_FILE_CHANGED');return bundle;
  };
  const handlers:LocalHandlers={
    'publication.pdfs':async r=>{const bundle=await bundleFor(String(r.documentHandle),r.revisionId);return {requestId:r.requestId,status:'success',data:{items:pdfCatalog?await pdfCatalog.list(bundle.document):[]}};},
    'publication.conflict':async r=>{
      if(!publication)throw Error('PUBLICATION_UNAVAILABLE');const binding=registry.resolve(String(r.documentHandle),owner,'document') as Binding,snapshot=structuredClone(validateDocument(r.snapshot));
      if(snapshot.documentId!==binding.documentId)throw Error('DOCUMENT_INVALID');
      const info=await publication.inspectConflict(snapshot);for(const[id,old]of resolutions)if(old.documentId===binding.documentId)resolutions.delete(id);
      const resolutionId=randomUUID();resolutions.set(resolutionId,info);return {requestId:r.requestId,status:'success',data:{resolutionId,kind:info.kind,...info.currentVersionId?{currentVersionId:info.currentVersionId}:{}}};
    },
    'publication.resolveConflict':async r=>{
      if(!publication||r.confirmed!==true)throw Error('CONFIRMATION_REQUIRED');const info=resolutions.get(String(r.resolutionId));resolutions.delete(String(r.resolutionId));
      const binding=registry.resolve(String(r.documentHandle),owner,'document') as Binding,local=structuredClone(validateDocument(r.snapshot));
      if(!info||info.documentId!==binding.documentId||local.documentId!==binding.documentId)throw Error('CONFLICT_NOT_AVAILABLE');
      const policy=remoteConflictPolicy({kind:info.kind==='current'?'unknown':info.kind});if(!policy.includes(String(r.choice)))throw Error('CONFLICT_NOT_AVAILABLE');await publication.canResolveConflict(info);
      if(r.choice!=='load-remote')return {requestId:r.requestId,status:'success',data:{snapshot:independentPattern(local),kind:'independent'}};
      if(!conflictBackups)throw Error('BACKUP_UNAVAILABLE');
      const fetched=await publication.downloadConflict(info);let candidate:PatternDocument|undefined;
      // Use the authoritative source binding, never a renderer-provided target.
      const source={...local,remoteBinding:{accountId:info.source.accountId,patternId:info.source.patternId,lastPublishedVersion:info.source.lastPublishedVersion}};
      const resolver=new ConflictResolver(conflictBackups,{snapshot:()=>source,replace:(_expected,next)=>{candidate=next;return true;}});
      const result=await resolver.loadRemote(fetched.metadata,async()=>fetched.bytes,true);publication.assertConflictActor(info);
      if(!candidate)throw Error('BACKUP_UNCONFIRMED');
      // A fresh local working-copy identity keeps the old file and its pending
      // journal/binding untouched, even if the renderer crashes before applying.
      const next:PatternDocument={...candidate,documentId:randomUUID()};next.revisionId=revisionId(next);
      return {requestId:r.requestId,status:'success',data:{snapshot:next,backupPath:result.backupPath,sourceVersionId:info.currentVersionId,kind:'remote'}};
    },
    'publication.action':async r=>{
      if(!publication)throw Error('PUBLICATION_UNAVAILABLE');const binding=registry.resolve(String(r.documentHandle),owner,'document') as Binding,body=r.body as Record<string,unknown>;
      let data:unknown;
      switch(r.action){
       case 'projects':data=await publication.projects(body.cursor as string|undefined);break;
       case 'createProject':data=await publication.createProject(binding.documentId,body.name as string);break;
       case 'status':data=await publication.status(binding.documentId,binding.remoteBinding);break;
       case 'check':await publication.reconcile(binding.documentId);data=await publication.status(binding.documentId,binding.remoteBinding);break;
       case 'abandon':if(body.confirmed!==true)throw Error('INVALID_INPUT');data=await publication.abandon(binding.documentId);break;
       case 'publish':data=await publication.publish(await bundleFor(String(r.documentHandle),r.revisionId,body.pdfIds as string[]|undefined),body.projectId as string,body.patternName as string);break;
       case 'continue':{
        let bundle=await bundleFor(String(r.documentHandle),r.revisionId);const required=await publication.pendingPdfs(binding.documentId);
        if(required.length){if(!pdfCatalog)throw Error('PDF_CATALOG_UNAVAILABLE');const available=await pdfCatalog.list(bundle.document),ids=required.map(file=>{const match=available.find(a=>a.sha256===file.sha256&&a.bytes===file.bytes&&a.preparationId===file.preparationId&&a.preparationHash===file.preparationHash&&a.exportProfileId===file.exportProfileId);if(!match)throw Error('PDF_ARTIFACT_MISSING');return match.id;});bundle=await bundleFor(String(r.documentHandle),r.revisionId,ids);}
        data=await publication.continueUpload(bundle);break;
       }
       default:throw Error('INVALID_INPUT');
      }
      return {requestId:r.requestId,status:'success',data};
    },
    'publication.prepare':async r=>{
      const bundle=await bundleFor(String(r.documentHandle),r.revisionId,r.pdfIds as string[]|undefined);
      // Descriptor only: paths, bytes and filesystem access stay in main.
      return {requestId:r.requestId,status:'success',data:{manifest:bundle.manifest,totalBytes:bundle.manifest.files.reduce((sum,f)=>sum+f.bytes,0)}};
    },
    'document.confirmTrash':async r=>{
      const binding=registry.resolve(String(r.documentHandle),owner,'document') as Binding;delete binding.trashApproval;
      if(!binding.path||!binding.identity||!dialogs.confirmTrash||!trashItem)throw new LocalDocumentError('TRASH_UNAVAILABLE');
      const choice=await dialogs.confirmTrash(basename(binding.path),r.dirty===true);
      if(choice==='cancel')return {requestId:r.requestId,status:'cancelled'};
      const confirmationId=randomUUID();binding.trashApproval={id:confirmationId,path:binding.path};
      return {requestId:r.requestId,status:'success',data:{choice,confirmationId}};
    },
    'document.trash':async r=>{
      const binding=registry.resolve(String(r.documentHandle),owner,'document') as Binding,approval=binding.trashApproval;delete binding.trashApproval;
      if(!trashItem||!binding.path||!binding.identity||!approval||approval.id!==r.confirmationId||approval.path!==binding.path||r.confirmed!==true)throw new LocalDocumentError('TRASH_UNAVAILABLE');
      await adapter.assertSupported(binding.path);
      const result=await new LocalDocumentTrash(trashItem).run({path:binding.path,expected:binding.identity,dirty:()=>false,choose:async()=> 'trash',save:async()=>null,completed:()=>{binding.path=null;binding.identity=null;}});
      if(result!=='trashed')throw new LocalDocumentError(result==='file_changed'?'EXTERNAL_FILE_CHANGED':'TRASH_UNAVAILABLE');
      return {requestId:r.requestId,status:'success',data:{trashed:true}};
    },
    'document.register':async r=>{
      uuid(r.documentId);const binding:Binding={documentId:r.documentId,revisionId:'0'.repeat(64),path:null,identity:null};
      return {requestId:r.requestId,status:'success',data:{documentHandle:registry.issue(owner,'document',binding)}};
    },
    'document.open':async r=>{
      const path=await dialogs.open();if(!path)return {requestId:r.requestId,status:'cancelled'};
      const candidate=await openDocument(path,adapter);
      const binding:Binding={documentId:candidate.snapshot.documentId,revisionId:candidate.snapshot.revisionId,path:candidate.identity.path,identity:candidate.identity,...candidate.snapshot.remoteBinding?{remoteBinding:candidate.snapshot.remoteBinding}:{}};
      return {requestId:r.requestId,status:'success',data:{documentHandle:registry.issue(owner,'document',binding),snapshot:candidate.snapshot,name:basename(path),saved:true}};
    },
    'document.save':async r=>{
      const binding=registry.resolve(String(r.documentHandle),owner,'document') as Binding;
      const snapshot=structuredClone(validateDocument(r.snapshot));
      if(snapshot.documentId!==binding.documentId||snapshot.revisionId!==r.revisionId||(binding.path!==null&&r.revisionId!==binding.revisionId))throw new LocalDocumentError('DOCUMENT_INVALID');
      let path=binding.path,expected=binding.identity;
      if(!path||r.mode==='saveAs'){
        if(binding.path&&JSON.stringify(await identity(binding.path))!==JSON.stringify(binding.identity))binding.blockedPath=binding.path;
        path=await dialogs.save(binding.path??undefined);if(!path)return {requestId:r.requestId,status:'cancelled'};
        await adapter.assertSupported(path);expected=await identity(path);
        if(expected&&!await dialogs.overwrite(basename(path)))return {requestId:r.requestId,status:'cancelled'};
      }
      try{
        const result=await writer.save({path,snapshot,expected,...binding.blockedPath?{blockedPath:binding.blockedPath}:{}});
        binding.path=result.identity.path;binding.identity=result.identity;binding.revisionId=result.snapshot.revisionId;
        binding.remoteBinding=result.snapshot.remoteBinding;
        return {requestId:r.requestId,status:'success',data:{snapshot:result.snapshot,revisionId:result.snapshot.revisionId,sha256:result.identity.hash,name:basename(path),saved:true}};
      }catch(error){
        if(error instanceof LocalDocumentError&&error.code==='EXTERNAL_FILE_CHANGED'&&binding.path)binding.blockedPath=binding.path;
        throw error;
      }
    },
  };
  for(const method of Object.keys(handlers) as (keyof LocalHandlers)[]){const run=handlers[method]!;handlers[method]=async request=>{
    if(busy)return {requestId:request.requestId,status:'error',error:{code:'OPERATION_PENDING',message:'Espera a que termine la operación de archivo actual.'}};
    busy=true;try{return await run(request);}catch(error){
      const code=error instanceof LocalDocumentError?error.code:error instanceof ValidationError?(error.code==='INVALID_INPUT'?'DOCUMENT_INVALID':error.code):request.method.startsWith('publication.')&&error instanceof Error&&/^[A-Z_]+$/.test(error.message)?error.message:'STORAGE_UNAVAILABLE';
      const message=code==='EXTERNAL_FILE_CHANGED'?'El archivo cambió fuera del CAD. Guarda en otro archivo o cancela; se conservan tus cambios.':code==='NATIVE_ADAPTER_UNAVAILABLE'?'Falta compilar el adaptador Windows. El documento se conserva sin guardar.':'No se pudo completar la operación de archivo. El documento actual se conserva; puedes consultar las copias de recuperación.';
      const remoteMessages:Record<string,string>={REMOTE_BINDING_REQUIRED:'El documento no tiene una publicación vinculada.',CONFLICT_CHANGED:'La versión remota volvió a cambiar. Comprueba de nuevo el conflicto.',CONFLICT_NOT_AVAILABLE:'Esta resolución ya no está disponible. Comprueba de nuevo el conflicto.',SESSION_REQUIRED:'Inicia sesión con conexión para publicar.',SESSION_CHANGED:'La sesión cambió. Comprueba el resultado con la cuenta original.',VERSION_CONFLICT:'La versión remota cambió. Se conserva tu trabajo local; resuelve el conflicto antes de publicar.',RESOURCE_TRASHED:'El recurso está en la papelera. Restáuralo antes de publicar.',OPERATION_PENDING:'Hay una operación pendiente. Comprueba su resultado antes de repetir.',SAVED_REVISION_MISMATCH:'La carga pendiente corresponde a otra revisión guardada. Conserva el documento y comprueba el intento anterior.',ACCOUNT_MISMATCH:'El patrón pertenece a otra cuenta. Inicia sesión en la cuenta original.'};
      return {requestId:request.requestId,status:'error',error:{code,message:remoteMessages[code]??message}};
    }finally{busy=false;}
  };}
  return handlers;
}
