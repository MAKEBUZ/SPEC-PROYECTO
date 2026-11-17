import {createHash} from 'node:crypto';
import {canonicalize,revisionId} from './revision.js';
import {validateDocument,type PatternDocument} from './schema.js';
import {array,finite,keys,object,text,uuid} from '../../contracts/src/validation.js';

export interface PdfMeasurement {exportProfileId:string;scale:number;pages:readonly {widthMm:number;heightMm:number}[]}
export interface PdfArtifact extends PdfMeasurement {
 readonly formatVersion:1;readonly id:string;readonly documentId:string;readonly revisionId:string;
 readonly preparationId:string;readonly preparationHash:string;readonly sha256:string;readonly bytes:number;
}
export const pdfHash=(bytes:Uint8Array|string)=>createHash('sha256').update(bytes).digest('hex');
function hash(value:unknown):asserts value is string {text(value);if(!/^[a-f0-9]{64}$/.test(value))throw Error('PDF_ARTIFACT_INVALID');}
function measurement(value:PdfMeasurement){
 text(value.exportProfileId);if(!value.exportProfileId.trim()||value.scale!==1)throw Error('PDF_ARTIFACT_INVALID');
 const pages=array(value.pages);if(!pages.length||pages.length>250)throw Error('PDF_ARTIFACT_INVALID');
 for(const input of pages){const p=object(input);keys(p,['widthMm','heightMm']);finite(p.widthMm);finite(p.heightMm);if(p.widthMm<=0||p.heightMm<=0)throw Error('PDF_ARTIFACT_INVALID');}
}
export function savedPdfOrigin(input:PatternDocument,preparationId:string){
 const document=validateDocument(input);uuid(preparationId);
 if(document.revisionId!==revisionId(document))throw Error('SAVED_REVISION_MISMATCH');
 const preparation=document.preparations.find(p=>p.id===preparationId);if(!preparation)throw Error('PREPARATION_NOT_FOUND');
 return {documentId:document.documentId,revisionId:document.revisionId,preparationId,preparationHash:pdfHash(canonicalize(preparation))};
}
/** Metadata only: never a substitute for the independent production verifier.
 * Called by main after verification of exactly these bytes and saved inputs. */
export function createPdfArtifact(document:PatternDocument,preparationId:string,bytes:Uint8Array,measured:PdfMeasurement):Readonly<PdfArtifact>{
 measurement(measured);if(!bytes.length||bytes.length>100000000)throw Error('FILE_TOO_LARGE');
 const content={formatVersion:1 as const,...savedPdfOrigin(document,preparationId),sha256:pdfHash(bytes),bytes:bytes.length,exportProfileId:measured.exportProfileId,scale:1,pages:measured.pages.map(p=>({...p}))};
 return parsePdfArtifact({...content,id:pdfHash(canonicalize(content))});
}
export function parsePdfArtifact(input:unknown):Readonly<PdfArtifact>{
 const a=object(input);keys(a,['formatVersion','id','documentId','revisionId','preparationId','preparationHash','sha256','bytes','exportProfileId','scale','pages']);
 if(a.formatVersion!==1)throw Error('PDF_ARTIFACT_INVALID');uuid(a.documentId);uuid(a.preparationId);for(const key of ['id','revisionId','preparationHash','sha256'])hash(a[key]);
 if(!Number.isSafeInteger(a.bytes)||Number(a.bytes)<=0||Number(a.bytes)>100000000)throw Error('PDF_ARTIFACT_INVALID');measurement(a as unknown as PdfMeasurement);
 const {id,...content}=a;if(id!==pdfHash(canonicalize(content)))throw Error('PDF_ARTIFACT_INVALID');
 const result=structuredClone(a) as unknown as PdfArtifact;result.pages.forEach(Object.freeze);Object.freeze(result.pages);return Object.freeze(result);
}
export function assertPdfOrigin(artifact:PdfArtifact,document:PatternDocument){
 const a=parsePdfArtifact(artifact),origin=savedPdfOrigin(document,a.preparationId);
 if(Object.entries(origin).some(([key,value])=>a[key as keyof PdfArtifact]!==value))throw Error('PDF_ORIGIN_MISMATCH');
}
