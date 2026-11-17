import {mkdir,readFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {createPdfArtifact,parsePdfArtifact,assertPdfOrigin,savedPdfOrigin,pdfHash,type PdfArtifact,type PdfMeasurement} from '../../../../../packages/document/src/pdf-artifact.js';
import {parseDocument,type PatternDocument} from '../../../../../packages/document/src/schema.js';
import {parseStrictJson} from '../../../../../packages/document/src/json.js';
import {exclusiveWrite} from '../documents/save.js';

/** Main-only verifier dependency. No renderer assertion or stored flag can
 * authorize production. T077 supplies this implementation; absent means deny. */
export type PdfVerifier=(bytes:Uint8Array,document:PatternDocument,preparationId:string,profile:string,signal?:AbortSignal)=>Promise<PdfMeasurement>;
export class PdfArtifactStore {
 constructor(private readonly root:string,private readonly verify?:PdfVerifier){}
 private path(id:string,suffix:string){if(!/^[a-f0-9]{64}$/.test(id))throw Error('PDF_ARTIFACT_INVALID');return join(this.root,id+suffix);}
 private async immutable(path:string,bytes:Uint8Array){
  try{await exclusiveWrite(path,bytes);}catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;if(!Buffer.from(await readFile(path)).equals(Buffer.from(bytes)))throw Error('PDF_ARTIFACT_CORRUPT');}
 }
 async persist(saved:Uint8Array,preparationId:string,pdf:Uint8Array,profile:string,signal?:AbortSignal){
  if(!this.verify)throw Error('PDF_VERIFIER_UNAVAILABLE');
  if(saved.length>100000000||!pdf.length||pdf.length>100000000)throw Error('FILE_TOO_LARGE');
  const document=parseDocument(new TextDecoder('utf-8',{fatal:true}).decode(saved)),bytes=Uint8Array.from(pdf);
  savedPdfOrigin(document,preparationId);
  signal?.throwIfAborted();
  const measured=await this.verify(Uint8Array.from(bytes),structuredClone(document),preparationId,profile,signal);
  signal?.throwIfAborted();
  if(measured.exportProfileId!==profile)throw Error('EXPORT_PROFILE_UNSUPPORTED');
  const artifact=createPdfArtifact(document,preparationId,bytes,measured);await mkdir(this.root,{recursive:true});
  // Metadata is the commit marker. Interrupted binary writes cannot appear in
  // the catalog; existing artifacts are compared, never overwritten.
  await this.immutable(this.path(artifact.id,'.pdf'),bytes);
  if(pdfHash(await readFile(this.path(artifact.id,'.pdf')))!==artifact.sha256)throw Error('PDF_ARTIFACT_CORRUPT');
  signal?.throwIfAborted();await this.immutable(this.path(artifact.id,'.json'),Buffer.from(JSON.stringify(artifact)));return artifact;
 }
 async read(id:string){
  const artifact=parsePdfArtifact(parseStrictJson(await readFile(this.path(id,'.json'),'utf8')));if(artifact.id!==id)throw Error('PDF_ARTIFACT_CORRUPT');
  const bytes=await readFile(this.path(id,'.pdf'));if(bytes.length!==artifact.bytes||pdfHash(bytes)!==artifact.sha256)throw Error('PDF_ARTIFACT_CORRUPT');return {artifact,bytes};
 }
 async list(document:PatternDocument){
  let names:string[];try{names=await readdir(this.root);}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return [];throw e;}
  const result:Readonly<PdfArtifact>[]=[];for(const name of names.sort())if(/^[a-f0-9]{64}\.json$/.test(name)){
   const {artifact}=await this.read(name.slice(0,-5));if(artifact.documentId===document.documentId&&artifact.revisionId===document.revisionId){assertPdfOrigin(artifact,document);result.push(artifact);}
  }return result;
 }
 async select(document:PatternDocument,ids:readonly string[]){
  if(!this.verify)throw Error('PDF_VERIFIER_UNAVAILABLE');if(new Set(ids).size!==ids.length)throw Error('PDF_SELECTION_DUPLICATE');
  const snapshot=structuredClone(document),result=[];
  for(const id of [...ids]){const {artifact,bytes}=await this.read(id);assertPdfOrigin(artifact,snapshot);
   const measured=await this.verify(Uint8Array.from(bytes),structuredClone(snapshot),artifact.preparationId,artifact.exportProfileId);
   if(createPdfArtifact(snapshot,artifact.preparationId,bytes,measured).id!==artifact.id)throw Error('PDF_ARTIFACT_MISMATCH');result.push({artifact,bytes});
  }return result;
 }
}
