import {createPrintPdf,PDF_PROFILE} from '../../../../packages/print/src/pdf.js';
import {verifyPrintPdf} from '../../../../packages/print/src/verify.js';
import {savedPdfOrigin} from '../../../../packages/document/src/pdf-artifact.js';
import type {PatternDocument} from '../../../../packages/document/src/schema.js';

export interface UploadedPdf {bytes:Uint8Array;profileId:string;preparationId:string;preparationHash:string}
/** Called only in the isolated artifact worker, against the uploaded editable revision. */
export async function verifyUploadedPdf(document:PatternDocument,pdf:UploadedPdf,assets:{font:Uint8Array}){
 if(pdf.profileId!==PDF_PROFILE.id)throw Error('EXPORT_PROFILE_UNSUPPORTED');
 try{
  const origin=savedPdfOrigin(document,pdf.preparationId);
  if(origin.preparationHash!==pdf.preparationHash)throw Error('ARTIFACT_MISMATCH');
  const generated=await createPrintPdf(document,pdf.preparationId,assets);
  if(!Buffer.from(generated.bytes).equals(pdf.bytes))throw Error('ARTIFACT_MISMATCH');
  return await verifyPrintPdf(pdf.bytes,document,pdf.preparationId,pdf.profileId);
 }catch{throw Error('ARTIFACT_MISMATCH');}
}
