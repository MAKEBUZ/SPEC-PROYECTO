import {parentPort,workerData} from 'node:worker_threads';
import {parseDocument} from '../../../../../packages/document/src/schema.js';
import {createPrintPdf,PDF_PROFILE} from '../../../../../packages/print/src/pdf.js';
import {verifyPrintPdf} from '../../../../../packages/print/src/verify.js';
async function run(){
 const input=workerData as {snapshot:Uint8Array;preparationId:string;font:Uint8Array;pdf?:Uint8Array;profileId?:string};
 const document=parseDocument(new TextDecoder('utf-8',{fatal:true}).decode(input.snapshot));
 if(!input.pdf)parentPort!.postMessage({state:'generating'});
 const generated=input.pdf?{bytes:input.pdf}:await createPrintPdf(document,input.preparationId,{font:input.font});
 parentPort!.postMessage({state:'verifying'});
 const measurement=await verifyPrintPdf(generated.bytes,document,input.preparationId,input.profileId??PDF_PROFILE.id);
 parentPort!.postMessage({state:'verified',...input.pdf?{}:{bytes:generated.bytes},measurement});
}
if(parentPort)void run().catch(e=>parentPort!.postMessage({state:'failed',error:e instanceof Error?e.message:'PDF_FAILED'}));
