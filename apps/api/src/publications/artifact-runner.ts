import { parentPort,workerData } from 'node:worker_threads';
import { renderPreview } from '../../../../packages/print/src/preview.js';
import { parseDocument } from '../../../../packages/document/src/schema.js';
import {verifyUploadedPdf,type UploadedPdf} from './pdf-verifier.js';
import {revisionId} from '../../../../packages/document/src/revision.js';
interface Input {editable:Uint8Array;preview?:Uint8Array;profileId?:string;pdf?:UploadedPdf;assets:{wasm:Uint8Array;font:Uint8Array}}
async function run(input:Input){
  const document=parseDocument(new TextDecoder('utf-8',{fatal:true}).decode(input.editable));
  let measurement;
  if(input.pdf)measurement=await verifyUploadedPdf(document,input.pdf,input.assets);
  else {
    if(!input.preview||!input.profileId)throw Error('ARTIFACT_MISMATCH');
    const generated=await renderPreview(document,input.assets,input.profileId);
    if(!Buffer.from(generated.bytes).equals(input.preview))throw new Error('ARTIFACT_MISMATCH');
  }
  return {revisionId:revisionId(document),documentId:document.documentId,...measurement?{measurement}:{}};
}
if(parentPort)void run(workerData as Input).then(result=>parentPort!.postMessage({ok:true,...result})).catch(error=>parentPort!.postMessage({ok:false,code:error instanceof Error&&['ARTIFACT_MISMATCH','EXPORT_PROFILE_UNSUPPORTED'].includes(error.message)?error.message:'INTERNAL_ERROR'}));
