import { LeaveGuard } from '../../main/documents/leave-guard.js';
import type { CadTools } from '../cad/tools.js';
import { validateDocument } from '../../../../../packages/document/src/schema.js';
interface Reply {status:string;data:unknown;error?:{message:string}}
export class DocumentActions {
  private guard=new LeaveGuard();private saving=false;private trashing=false;
  private unloadVersion:number|undefined;
  private binding:{epoch:number;handle:string}|undefined;
  private publicationQueue:Promise<void>=Promise.resolve();
  private exporting=false;
  constructor(private readonly tools:CadTools,private readonly transport:(r:Record<string,unknown>)=>Promise<Reply>,private readonly error:(message:string)=>void){}
  private async request(method:string,fields:Record<string,unknown>={}){
    const send=()=>this.transport({requestId:crypto.randomUUID(),method,...fields});
    // Polling the publication state must not race a conflict operation against
    // the main-process document lock. Preserve order and continue after errors.
    const pending=method.startsWith('publication.')?this.publicationQueue.then(send):send();
    if(method.startsWith('publication.'))this.publicationQueue=pending.then(()=>{},()=>{});
    const r=await pending;
    if(r.status==='error')throw Error(r.error?.message||'No se pudo completar la operación.');return r;
  }
  save(mode:'save'|'saveAs'='save'){return this.trashing||this.tools.locked?Promise.resolve(false):this.persist(mode);}
  async exportPdf(preparationId:string,progress:(state:{state:string;error?:string;name?:string})=>void,onJob:(jobId:string)=>void){
    if(this.saving||this.trashing||this.tools.locked||this.exporting)return;
    this.exporting=true;
    try{
    if(this.tools.dirty||this.binding?.epoch!==this.tools.documentEpoch){
      const confirmation=await this.request('export.confirmSave');
      if(!(confirmation.data as {confirmed?:boolean}).confirmed||!await this.save()||this.tools.dirty)return;
    }
    if(!this.binding||this.binding.epoch!==this.tools.documentEpoch)return;
    const unlock=this.tools.lockEditing();
    try{
      progress({state:'starting'});
      const reply=await this.request('export.generate',{documentHandle:this.binding.handle,revisionId:this.tools.document().revisionId,preparationId});
      if(reply.status!=='success'){progress({state:'cancelled'});return;}
      const jobId=(reply.data as {jobId:string}).jobId;onJob(jobId);
      for(;;){
        try{const current=await this.request('export.status',{jobId}),state=current.data as {state:string;error?:string;name?:string};progress(state);if(['completed','cancelled','failed'].includes(state.state))break;}
        catch{progress({state:'checking',error:'No se pudo comprobar el estado. Se reintentará; la preparación sigue protegida.'});}
        await new Promise(resolve=>setTimeout(resolve,250));
      }
    }catch(e){progress({state:'failed',error:e instanceof Error?e.message:'No se pudo exportar.'});}
    finally{unlock();}
    }finally{this.exporting=false;}
  }
  cancelExport(jobId:string){return this.request('export.cancel',{jobId});}
  async inspectConflict(){
    if(this.saving||this.trashing||this.binding?.epoch!==this.tools.documentEpoch)throw Error('Abre o guarda el documento para comprobar su publicación.');const version=this.tools.getVersion();
    const r=await this.request('publication.conflict',{documentHandle:this.binding.handle,snapshot:this.tools.document()});if(r.status!=='success'||version!==this.tools.getVersion())throw Error('El documento cambió. Comprueba de nuevo el conflicto.');return r.data;
  }
  async resolveConflict(resolutionId:string,choice:'independent'|'load-remote'|'publish-new',confirmed:boolean){
    if(!confirmed)throw Error('Confirma la resolución antes de continuar.');if(this.saving||this.trashing||this.binding?.epoch!==this.tools.documentEpoch)throw Error('El documento activo cambió.');
    const version=this.tools.getVersion(),r=await this.request('publication.resolveConflict',{documentHandle:this.binding.handle,snapshot:this.tools.document(),resolutionId,choice,confirmed:true});
    if(r.status!=='success')throw Error('No se pudo resolver el conflicto.');const result=r.data as {snapshot:unknown;backupPath?:string;kind:string};
    try{this.tools.resolveConflict(validateDocument(result.snapshot),version);}catch(e){throw Error((e instanceof Error?e.message:'El documento cambió.')+(result.backupPath?` Respaldo: ${result.backupPath}`:''));}this.binding=undefined;this.error('');return {backupPath:result.backupPath,kind:result.kind};
  }
  async publication(action:string,body:Record<string,unknown>={}){
    if(this.saving||this.trashing||this.binding?.epoch!==this.tools.documentEpoch)throw Error('Guarda o abre un documento antes de publicar.');
    if(['publish','continue'].includes(action)&&this.tools.dirty)throw Error('Guarda los cambios antes de publicar.');
    const epoch=this.tools.documentEpoch,r=await this.request('publication.action',{documentHandle:this.binding.handle,revisionId:this.tools.document().revisionId,action,body});
    if(r.status!=='success'||epoch!==this.tools.documentEpoch)throw Error('El documento activo cambió; el intento permanece vinculado al documento original.');
    const data=r.data as {binding?:{accountId:string;patternId:string;lastPublishedVersion:string}|null};
    if(data.binding){const {accountId,patternId,lastPublishedVersion}=data.binding;this.tools.attachRemoteBinding({accountId,patternId,lastPublishedVersion});}
    return r.data;
  }
  async listPdfs(){
    if(this.saving||this.trashing||this.tools.dirty||this.binding?.epoch!==this.tools.documentEpoch)throw Error('Guarda el documento antes de elegir sus PDF.');
    const version=this.tools.getVersion(),r=await this.request('publication.pdfs',{documentHandle:this.binding.handle,revisionId:this.tools.document().revisionId});
    if(r.status!=='success'||version!==this.tools.getVersion())throw Error('La revisión cambió. Actualiza los PDF disponibles.');return r.data;
  }
  async preparePublication(pdfIds:readonly string[]=[]){
    if(this.saving||this.trashing||this.tools.dirty||this.binding?.epoch!==this.tools.documentEpoch)throw Error('Guarda el documento antes de preparar la publicación.');
    const version=this.tools.getVersion(),r=await this.request('publication.prepare',{documentHandle:this.binding.handle,revisionId:this.tools.document().revisionId,pdfIds});
    if(r.status!=='success'||this.tools.getVersion()!==version)throw Error('El documento cambió durante la preparación. Vuelve a prepararlo después de guardar.');
    return r.data;
  }
  private async persist(mode:'save'|'saveAs'='save'):Promise<boolean>{
    if(this.saving)return false;this.saving=true;
    const epoch=this.tools.documentEpoch,snapshot=this.tools.document();
    try{
      if(this.binding?.epoch!==epoch){const registered=await this.request('document.register',{documentId:snapshot.documentId});if(registered.status!=='success')return false;this.binding={epoch,handle:(registered.data as {documentHandle:string}).documentHandle};}
      const r=await this.request('document.save',{documentHandle:this.binding.handle,snapshot,revisionId:snapshot.revisionId,mode});
      if(r.status!=='success'||this.tools.documentEpoch!==epoch)return false;
      this.tools.markSaved(validateDocument((r.data as {snapshot:unknown}).snapshot));this.error('');return true;
    }catch(e){this.error(e instanceof Error?e.message:'No se pudo guardar. Se conservan tus cambios.');return false;}finally{this.saving=false;}
  }
  private leave(action:()=>Promise<void>){
    if(this.saving||this.trashing||this.tools.locked)return Promise.resolve(false);
    return this.guard.run({dirty:()=>this.tools.dirty,choose:async()=>{const r=await this.request('document.confirmLeave');const choice=(r.data as {choice?:string})?.choice;return choice==='save'||choice==='discard'?choice:'cancel';},save:()=>this.save(),leave:action}).catch(e=>{this.error(e instanceof Error?e.message:'No se pudo completar la acción.');return false;});
  }
  create(){return this.leave(async()=>{this.tools.create(true);this.error('');});}
  open(){return this.leave(async()=>{
    const version=this.tools.getVersion(),r=await this.request('document.open');if(r.status!=='success')return;
    const data=r.data as {snapshot:unknown;documentHandle:string};
    this.tools.loadSaved(validateDocument(data.snapshot),version);this.binding={epoch:this.tools.documentEpoch,handle:data.documentHandle};this.error('');
  });}
  mayUnload(){return this.unloadVersion===this.tools.getVersion();}
  async trash(){
    if(this.saving||this.trashing||this.tools.locked)return false;
    if(!this.binding||this.binding.epoch!==this.tools.documentEpoch){this.error('Este documento no tiene una copia local abierta o guardada para enviar a la papelera.');return false;}
    this.trashing=true;const epoch=this.tools.documentEpoch,version=this.tools.getVersion(),handle=this.binding.handle;
    try{
      const confirmation=await this.request('document.confirmTrash',{documentHandle:handle,dirty:this.tools.dirty});
      if(confirmation.status!=='success'||version!==this.tools.getVersion())return false;
      const {choice,confirmationId}=confirmation.data as {choice:string;confirmationId:string};
      if(!['save','discard','trash'].includes(choice))return false;
      if(choice==='save'&&(!await this.persist()||this.tools.dirty))return false;
      if(choice==='trash'&&this.tools.dirty)return false;
      const expected=this.tools.getVersion();
      const result=await this.request('document.trash',{documentHandle:handle,confirmed:true,confirmationId});if(result.status!=='success')return false;
      this.binding=undefined;
      if(this.tools.documentEpoch===epoch){if(this.tools.getVersion()===expected)this.tools.create(true);else this.tools.markUnsaved();}
      this.error('');return true;
    }catch(e){this.error(e instanceof Error?e.message:'No se pudo enviar a la papelera. Se conserva el documento.');return false;}finally{this.trashing=false;}
  }
  async close(token:string){const completed=await this.leave(async()=>{this.unloadVersion=this.tools.getVersion();await this.request('window.closeApproved',{closeToken:token});});if(!completed){this.unloadVersion=undefined;await this.request('window.closeCancelled',{closeToken:token}).catch(()=>{});}}
}
