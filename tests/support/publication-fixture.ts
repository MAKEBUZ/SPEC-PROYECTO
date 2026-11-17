import { randomUUID,createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { expect } from 'vitest';
import type { AccountHost,Session } from './account-host.js';
import { renderPreview } from '../../packages/print/src/preview.js';
import { revisionId } from '../../packages/document/src/revision.js';
import { manifestDigest } from '../../apps/api/src/publications/staging.service.js';
import type { HttpDto } from '../../packages/contracts/src/http-dto.js';
import type { PatternDocument } from '../../packages/document/src/schema.js';
import {preparePublication} from '../../apps/desktop/src/main/publication/bundle.js';
import {pdfFixture} from './pdf-fixture.js';
import {createPrintPdf,PDF_PROFILE} from '../../packages/print/src/pdf.js';
import {savedPdfOrigin} from '../../packages/document/src/pdf-artifact.js';
export async function publishRevision(host:AccountHost,session:Session,document:PatternDocument,target:{projectId:string;patternId:string;versionId:string}){
 const snapshot=structuredClone(document);snapshot.revisionId=revisionId(snapshot);
 const bundle=await preparePublication(Buffer.from(JSON.stringify(snapshot)),'revision.patron',{wasm:await readFile('node_modules/@resvg/resvg-wasm/index_bg.wasm'),font:await readFile('.local/assets/NotoSans-Regular.ttf')});
 const begin=await host.request('POST','/publications',{operationId:randomUUID(),projectId:target.projectId,patternId:target.patternId,expectedVersionId:target.versionId,manifest:bundle.manifest},session);expect(begin.status).toBe(201);
 for(const file of bundle.files){const response=await host.uploadFile(`/publications/${begin.body.publicationId}/files/${file.fileId}`,Buffer.from(file.bytes),session,{'x-content-sha256':bundle.manifest.files.find(f=>f.fileId===file.fileId)!.sha256});expect(response.status).toBe(200);await response.arrayBuffer();}
 const operationId=randomUUID();await host.request('POST',`/publications/${begin.body.publicationId}/commit`,{operationId,manifestHash:bundle.manifest.manifestHash},session);await host.finishPublications();
 const result=await host.request('GET',`/operations/${operationId}?operationType=commitPublication`,undefined,session);expect(result.body.outcome).toBe('success');return {document:snapshot,versionId:(result.body.authorizedResourceRefs as {kind:string;id:string}[]).find(r=>r.kind==='version')!.id};
}
export async function publishedFixture(host:AccountHost,session:Session,preparationNameLength=0,includePdf=false){
  const doc:PatternDocument=includePdf?pdfFixture().document:{formatVersion:1,documentId:randomUUID(),revisionId:'0'.repeat(64),units:'mm',pieces:[],preparations:[]};
  if(preparationNameLength)doc.preparations.push({id:randomUUID(),name:'x'.repeat(preparationNameLength),selection:[],transforms:{},mode:'large',paper:'A4',margin:10});
  doc.revisionId=revisionId(doc);
  const editable=Buffer.from(JSON.stringify(doc)),preview=Buffer.from((await renderPreview(doc,{wasm:await readFile('node_modules/@resvg/resvg-wasm/index_bg.wasm'),font:await readFile('.local/assets/NotoSans-Regular.ttf')})).bytes);
  const manifest:HttpDto<'BeginPublication'>['manifest']={documentId:doc.documentId,localRevisionId:doc.revisionId,manifestHash:'0'.repeat(64),files:[{fileId:randomUUID(),role:'editable',originalName:'../Mi patrón\r\n.patron',mediaType:'application/json',bytes:editable.length,sha256:createHash('sha256').update(editable).digest('hex')},{fileId:randomUUID(),role:'preview',originalName:'vista.png',mediaType:'image/png',bytes:preview.length,sha256:createHash('sha256').update(preview).digest('hex'),exportProfileId:'patronaje-preview-1'}]};manifest.manifestHash=manifestDigest(manifest);
  let pdf:Buffer|undefined;
  if(includePdf){const preparationId=doc.preparations[0]!.id as string;pdf=Buffer.from((await createPrintPdf(doc,preparationId,{font:await readFile('.local/assets/NotoSans-Regular.ttf')})).bytes);manifest.files.push({fileId:randomUUID(),role:'pdf',originalName:'impresion.pdf',mediaType:'application/pdf',bytes:pdf.length,sha256:createHash('sha256').update(pdf).digest('hex'),exportProfileId:PDF_PROFILE.id,preparationId,preparationHash:savedPdfOrigin(doc,preparationId).preparationHash});manifest.manifestHash=manifestDigest(manifest);}
  const project=await host.request('POST','/projects',{operationId:randomUUID(),name:'Library'},session),begin=await host.request('POST','/publications',{operationId:randomUUID(),projectId:project.body.id,patternName:'Patrón',manifest},session);
  expect(begin.status).toBe(201);
  for(const [i,bytes] of [editable,preview,...pdf?[pdf]:[]].entries())expect((await host.uploadFile(`/publications/${begin.body.publicationId}/files/${manifest.files[i]!.fileId}`,bytes,session,{'x-content-sha256':manifest.files[i]!.sha256})).status).toBe(200);
  const input={operationId:randomUUID(),manifestHash:manifest.manifestHash};await host.queuePublication(session,begin.body.publicationId as string,input);await host.finishPublications();
  const result=await host.request('POST',`/publications/${begin.body.publicationId}/commit`,input,session);expect(result.body.outcome).toBe('success');
  return {...result.body.data as {patternId:string;versionId:string;files:HttpDto<'FileView'>[]},editable,preview,pdf,projectId:project.body.id as string};
}
