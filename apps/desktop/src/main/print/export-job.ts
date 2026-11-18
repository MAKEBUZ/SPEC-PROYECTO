import {Worker} from 'node:worker_threads';
import type {PdfMeasurement} from '../../../../../packages/document/src/pdf-artifact.js';
import {pdfHash} from '../../../../../packages/document/src/pdf-artifact.js';
export type ExportState='generating'|'verifying'|'verified'|'cancelling'|'cancelled'|'failed';
export interface ExportProgress {state:ExportState;error?:string}
export interface VerifiedExport {bytes:Uint8Array;measurement:PdfMeasurement}
const attestations=new WeakMap<VerifiedExport,{savedHash:string;preparationId:string;pdfHash:string;measurement:PdfMeasurement}>();
/** In-process capability, never serialized or accepted from IPC/storage. Only
 * a successfully exited independent verifier worker can issue an attestation. */
export function attestedExport(result:VerifiedExport,saved:Uint8Array,preparationId:string):PdfMeasurement{
 const proof=attestations.get(result);
 if(!proof||proof.savedHash!==pdfHash(saved)||proof.preparationId!==preparationId||proof.pdfHash!==pdfHash(result.bytes)||JSON.stringify(proof.measurement)!==JSON.stringify(result.measurement))throw Error('PDF_EXPORT_ATTESTATION_INVALID');
 return structuredClone(proof.measurement);
}
/** CPU work lives outside Electron main. The snapshot and assets are copied at
 * construction, and no elapsed-time limit silently cancels valid geometry. */
export class ExportJob {
 private worker:Worker;
 private current:ExportProgress={state:'generating'};
 private output:VerifiedExport|undefined;
 private listeners=new Set<(p:ExportProgress)=>void>();
 readonly finished:Promise<VerifiedExport|null>;
 private settle!:(value:VerifiedExport|null)=>void;
 private stop:Promise<void>|undefined;
 constructor(snapshot:Uint8Array,preparationId:string,font:Uint8Array,runner=new URL('./export-runner.js',import.meta.url)){
  const savedHash=pdfHash(snapshot);
  this.finished=new Promise(resolve=>{this.settle=resolve;});
  this.worker=new Worker(runner,{workerData:{snapshot:Uint8Array.from(snapshot),preparationId,font:Uint8Array.from(font)},resourceLimits:{maxOldGenerationSizeMb:512}});
  this.worker.on('message',(message:ExportProgress&Partial<VerifiedExport>)=>{
   if(this.current.state==='cancelling'||this.current.state==='cancelled')return;
   if(message.state==='verified'&&message.bytes&&message.measurement)this.output={bytes:message.bytes,measurement:message.measurement};
   else if(message.state==='generating'||message.state==='verifying'||message.state==='failed')this.update(message);
  });
  this.worker.once('error',()=>{if(this.current.state!=='cancelling')this.update({state:'failed',error:'PDF_WORKER_FAILED'});});
  this.worker.once('exit',code=>{
   if(this.current.state==='cancelling'){this.output=undefined;this.update({state:'cancelled'});this.settle(null);}
   else if(code===0&&this.output&&this.current.state!=='failed'){
    attestations.set(this.output,{savedHash,preparationId,pdfHash:pdfHash(this.output.bytes),measurement:structuredClone(this.output.measurement)});
    this.update({state:'verified'});this.settle(this.output);
   }
   else {if(this.current.state!=='failed')this.update({state:'failed',error:'PDF_WORKER_FAILED'});this.settle(null);}
  });
 }
 get progress(){return {...this.current};}
 subscribe(listener:(p:ExportProgress)=>void){this.listeners.add(listener);listener(this.progress);return ()=>{this.listeners.delete(listener);};}
 private update(p:ExportProgress){this.current={state:p.state,...(p.error?{error:p.error}:{})};for(const listener of this.listeners)listener(this.progress);}
 cancel():Promise<void>{
  if(this.stop)return this.stop;
  if(['verified','failed','cancelled'].includes(this.current.state))return Promise.resolve();
  this.update({state:'cancelling'});
  this.stop=this.worker.terminate().then(()=>this.finished).then(()=>{});return this.stop;
 }
}
