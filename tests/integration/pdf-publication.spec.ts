import {beforeAll,afterAll,it,expect} from 'vitest';
import {randomUUID as id} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {startAccountHost,type AccountHost} from '../support/account-host.js';
import {pdfFixture} from '../support/pdf-fixture.js';
import {createPrintPdf,PDF_PROFILE} from '../../packages/print/src/pdf.js';
import {renderPreview} from '../../packages/print/src/preview.js';
import {savedPdfOrigin,pdfHash} from '../../packages/document/src/pdf-artifact.js';
import {manifestDigest} from '../../apps/api/src/publications/staging.service.js';
import type {HttpDto} from '../../packages/contracts/src/http-dto.js';
let host:AccountHost;
beforeAll(async()=>{host=await startAccountHost();},30000);afterAll(async()=>{await host?.close();});
it.each([{tampered:false,existing:false},{tampered:true,existing:false},{tampered:false,existing:true},{tampered:true,existing:true}])('validates the entire publication in isolated workers ($tampered, prior version: $existing)',async({tampered,existing})=>{
 const account=await host.verifiedAccount(),{document,preparation}=pdfFixture(),assets={font:await readFile('.local/assets/NotoSans-Regular.ttf'),wasm:await readFile('node_modules/@resvg/resvg-wasm/index_bg.wasm')};
 const editable=Buffer.from(JSON.stringify(document)),preview=(await renderPreview(document,assets)).bytes,generated=(await createPrintPdf(document,preparation.id,assets)).bytes;
 const pdf=tampered?Buffer.from(Buffer.from(generated).toString('latin1').replace('20000101','20010101'),'latin1'):generated;
 const origin=savedPdfOrigin(document,preparation.id),bodies=[editable,preview,pdf];
 const manifest:HttpDto<'BeginPublication'>['manifest']={documentId:document.documentId,localRevisionId:document.revisionId,manifestHash:'0'.repeat(64),files:[
  {fileId:id(),role:'editable',originalName:'documento.patron',mediaType:'application/json',bytes:editable.length,sha256:pdfHash(editable)},
  {fileId:id(),role:'preview',originalName:'vista.png',mediaType:'image/png',bytes:preview.length,sha256:pdfHash(preview),exportProfileId:'patronaje-preview-1'},
  {fileId:id(),role:'pdf',originalName:'impresion.pdf',mediaType:'application/pdf',bytes:pdf.length,sha256:pdfHash(pdf),exportProfileId:PDF_PROFILE.id,preparationId:preparation.id,preparationHash:origin.preparationHash}
 ]};manifest.manifestHash=manifestDigest(manifest);
 const project=await host.request('POST','/projects',{operationId:id(),name:'PDF'},account.session);
 let previous:{patternId:string;versionId:string}|undefined,previousFiles:unknown[]=[];
 if(existing){
  const initial={...manifest,files:manifest.files.slice(0,2).map(f=>({...f,fileId:id()}))};initial.manifestHash=manifestDigest(initial);
  const first=await host.request('POST','/publications',{operationId:id(),projectId:project.body.id,patternName:'Sin PDF',manifest:initial},account.session);expect(first.status).toBe(201);
  for(const [i,bytes] of [editable,preview].entries()){const upload=await host.uploadFile(`/publications/${first.body.publicationId}/files/${initial.files[i]!.fileId}`,Buffer.from(bytes),account.session,{'x-content-sha256':pdfHash(bytes)});expect(upload.status).toBe(200);await upload.arrayBuffer();}
  const commit={operationId:id(),manifestHash:initial.manifestHash};await host.queuePublication(account.session,first.body.publicationId as string,commit);await host.finishPublications();
  const result=await host.request('POST',`/publications/${first.body.publicationId}/commit`,commit,account.session);expect(result.body.outcome).toBe('success');previous=result.body.data as typeof previous;
  previousFiles=(await host.pool.query('SELECT * FROM stored_files WHERE version_id=$1 ORDER BY id',[previous!.versionId])).rows;
 }
 const begin=await host.request('POST','/publications',{operationId:id(),projectId:project.body.id,...previous?{patternId:previous.patternId,expectedVersionId:previous.versionId}:{patternName:'Patrón con PDF'},manifest},account.session);expect(begin.status).toBe(201);
 for(const [i,bytes] of bodies.entries()){
  const response=await host.uploadFile(`/publications/${begin.body.publicationId}/files/${manifest.files[i]!.fileId}`,Buffer.from(bytes),account.session,{'x-content-sha256':pdfHash(bytes)});expect(response.status).toBe(200);await response.arrayBuffer();
 }
 const input={operationId:id(),manifestHash:manifest.manifestHash};await host.queuePublication(account.session,begin.body.publicationId as string,input);await host.finishPublications();
 const result=await host.request('POST',`/publications/${begin.body.publicationId}/commit`,input,account.session);expect(result.body.outcome).toBe(tampered?'failure':'success');
 const versions=await host.pool.query('SELECT count(*) FROM versions v JOIN patterns p ON p.id=v.pattern_id WHERE p.owner_id=$1',[account.accountId]);expect(Number(versions.rows[0].count)).toBe((existing?1:0)+(tampered?0:1));
 if(previous){
  expect((await host.pool.query('SELECT * FROM stored_files WHERE version_id=$1 ORDER BY id',[previous.versionId])).rows).toEqual(previousFiles);
  expect(previousFiles).toHaveLength(2);
  for(const row of previousFiles as {private_key:string;sha256:string}[])expect(pdfHash(await host.blobs.get(row.private_key))).toBe(row.sha256);
  const recorded=(await host.pool.query('SELECT author_id,local_revision_id,created_at FROM versions WHERE pattern_id=$1',[previous.patternId])).rows;
  expect(recorded.every(v=>v.author_id===account.accountId&&v.local_revision_id===document.revisionId&&v.created_at instanceof Date)).toBe(true);
  if(tampered)expect((await host.pool.query('SELECT latest_version_id FROM patterns WHERE id=$1',[previous.patternId])).rows[0].latest_version_id).toBe(previous.versionId);
 }
 if(tampered)expect(JSON.stringify(result.body)).toContain('ARTIFACT_MISMATCH');
  else {
   const data=result.body.data as {versionId:string},reply=await host.request('GET',`/versions/${data.versionId}/files`,undefined,account.session);
   const file=(reply.body.items as {role:string;measurement?:{scale:number;pages:{widthMm:number;heightMm:number}[]}}[]).find(f=>f.role==='pdf')!;
   expect(file.measurement?.scale).toBe(1);expect(file.measurement?.pages).toHaveLength(1);expect(file.measurement?.pages[0]?.widthMm).toBeCloseTo(140,3);
  }
},30000);
