import {Worker} from 'node:worker_threads';
import type {PdfVerifier} from '../publication/pdf-artifact-store.js';
import type {PdfMeasurement} from '../../../../../packages/document/src/pdf-artifact.js';
/** Catalog verification cannot run expensive geometry on Electron's UI thread. */
export function isolatedPdfVerifier(runner=new URL('./export-runner.js',import.meta.url)):PdfVerifier{return (bytes,document,preparationId,profileId,signal)=>new Promise((resolve,reject)=>{
 if(signal?.aborted){reject(Error('PDF_VERIFICATION_CANCELLED'));return;}
 const worker=new Worker(runner,{workerData:{snapshot:Buffer.from(JSON.stringify(document)),preparationId,pdf:Uint8Array.from(bytes),profileId},resourceLimits:{maxOldGenerationSizeMb:512}});
 let measurement:PdfMeasurement|undefined,error:string|undefined;
 const abort=()=>{error='PDF_VERIFICATION_CANCELLED';void worker.terminate();};signal?.addEventListener('abort',abort,{once:true});
 worker.on('message',(message:{state:string;measurement?:PdfMeasurement;error?:string})=>{if(message.state==='verified')measurement=message.measurement;else if(message.state==='failed')error=message.error??'PDF_INVALID';});
 worker.once('error',reject);worker.once('exit',code=>{signal?.removeEventListener('abort',abort);if(code===0&&measurement&&!error)resolve(measurement);else reject(Error(error??'PDF_WORKER_FAILED'));});
});}
export const verifyPdfIsolated=isolatedPdfVerifier();
