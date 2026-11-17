import {createHash,randomUUID} from 'node:crypto';
import {parseDocument,type PatternDocument} from '../../../../../packages/document/src/schema.js';
import {canonicalize,revisionId} from '../../../../../packages/document/src/revision.js';
import {renderPreview} from '../../../../../packages/print/src/preview.js';
import type {RenderAssets} from '../../../../../packages/print/src/profile.js';
import {DTO,type HttpDto} from '../../../../../packages/contracts/src/http-dto.js';
import type {PdfArtifactStore} from './pdf-artifact-store.js';

export interface PublicationBundle {
 document:PatternDocument;
 manifest:HttpDto<'Manifest'>;
 files:{fileId:string;bytes:Uint8Array}[];
}
const hash=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
/** Main-process only. The caller must obtain these bytes from a verified saved
 * document capability, never from an arbitrary renderer path or snapshot. */
export async function preparePublication(saved:Uint8Array,name:string,assets:RenderAssets,pdfs?:{store:PdfArtifactStore;ids:readonly string[]}):Promise<PublicationBundle>{
 if(saved.byteLength>100000000)throw Error('FILE_TOO_LARGE');
 const editable=Uint8Array.from(saved),document=parseDocument(new TextDecoder('utf-8',{fatal:true}).decode(editable));
 if(document.revisionId!==revisionId(document))throw Error('SAVED_REVISION_MISMATCH');
 const preview=await renderPreview(document,assets);
 if(preview.revisionId!==document.revisionId)throw Error('ARTIFACT_MISMATCH');
 const files=[{fileId:randomUUID(),bytes:editable},{fileId:randomUUID(),bytes:preview.bytes}];
 const manifestFiles:HttpDto<'Manifest'>['files']=[
  {fileId:files[0]!.fileId,role:'editable' as const,originalName:name,mediaType:'application/vnd.patronaje+json',bytes:editable.length,sha256:hash(editable)},
  {fileId:files[1]!.fileId,role:'preview' as const,originalName:'vista-previa.png',mediaType:'image/png',bytes:preview.bytes.length,sha256:hash(preview.bytes),exportProfileId:preview.exportProfileId},
 ];
 if(pdfs)for(const {artifact,bytes} of await pdfs.store.select(document,pdfs.ids)){
  const fileId=randomUUID();files.push({fileId,bytes});manifestFiles.push({fileId,role:'pdf',originalName:`impresion-${artifact.id}.pdf`,mediaType:'application/pdf',bytes:bytes.length,sha256:artifact.sha256,exportProfileId:artifact.exportProfileId,preparationId:artifact.preparationId,preparationHash:artifact.preparationHash});
 }
 const content={documentId:document.documentId,localRevisionId:document.revisionId,files:manifestFiles};
 const manifest=DTO.Manifest.parse({...content,manifestHash:hash(Buffer.from(canonicalize(content)))});
 return {document,manifest,files};
}
