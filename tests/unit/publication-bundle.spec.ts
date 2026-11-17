import {expect,it} from 'vitest';
import {randomUUID} from 'node:crypto';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {PdfArtifactStore} from '../../apps/desktop/src/main/publication/pdf-artifact-store.js';
import {revisionId} from '../../packages/document/src/revision.js';
import {manifestDigest} from '../../apps/api/src/publications/staging.service.js';
import {preparePublication} from '../../apps/desktop/src/main/publication/bundle.js';
import type {PatternDocument} from '../../packages/document/src/schema.js';
const document=():PatternDocument=>{const d:PatternDocument={formatVersion:1,documentId:randomUUID(),revisionId:'0'.repeat(64),units:'mm',pieces:[],preparations:[]};d.revisionId=revisionId(d);return d;};
const assets=async()=>({wasm:await readFile('node_modules/@resvg/resvg-wasm/index_bg.wasm'),font:await readFile('.local/assets/NotoSans-Regular.ttf')});
it('adds only selected, reverified artifacts from the saved revision to a new manifest',async()=>{
 const root=await mkdtemp(join(tmpdir(),'pdf-bundle-'));try{
  const d=document(),preparationId=randomUUID();d.preparations=[{id:preparationId,name:'P',selection:[],transforms:{},mode:'large',paper:'A4',margin:10}];d.revisionId=revisionId(d);
  const saved=Buffer.from(JSON.stringify(d)),a=await assets(),before=await preparePublication(saved,'p.patron',a),store=new PdfArtifactStore(root,async()=>({exportProfileId:'test-only',scale:1,pages:[{widthMm:210,heightMm:297}]}));
  const pdf=Buffer.from('test bytes, verifier is a controlled port'),artifact=await store.persist(saved,preparationId,pdf,'test-only');
  const bundle=await preparePublication(saved,'p.patron',a,{store,ids:[artifact.id]});expect(bundle.manifest.files.map(f=>f.role)).toEqual(['editable','preview','pdf']);expect(bundle.files[2]!.bytes).toEqual(pdf);expect(bundle.manifest.manifestHash).toBe(manifestDigest(bundle.manifest));expect(before.manifest.files).toHaveLength(2);
  expect(bundle.manifest.files[2]).toMatchObject({preparationId,preparationHash:artifact.preparationHash,sha256:artifact.sha256});
  d.preparations[0]!.margin=11;d.revisionId=revisionId(d);await expect(preparePublication(Buffer.from(JSON.stringify(d)),'p.patron',a,{store,ids:[artifact.id]})).rejects.toThrow('PDF_ORIGIN_MISMATCH');
 }finally{await rm(root,{recursive:true,force:true});}
});
it('uses exact saved editable bytes, generates preview and matches the server manifest digest',async()=>{
 const d=document(),bytes=Buffer.from(JSON.stringify(d,null,2)),before=Buffer.from(bytes),bundle=await preparePublication(bytes,'Diseño.patron',await assets());
 expect(bundle.document).toEqual(d);expect(bundle.files[0]!.bytes).toEqual(new Uint8Array(before));expect(bundle.manifest.manifestHash).toBe(manifestDigest(bundle.manifest));
 expect(bundle.manifest.files.map(f=>f.role)).toEqual(['editable','preview']);expect(bundle.files[1]!.bytes.slice(0,8)).toEqual(new Uint8Array([137,80,78,71,13,10,26,10]));
 bytes.fill(0);expect(bundle.files[0]!.bytes).toEqual(new Uint8Array(before));
});
it('rejects a false saved revision and malformed UTF-8 without repairing them',async()=>{
 const d=document();d.revisionId='0'.repeat(64);const a=await assets();
 await expect(preparePublication(Buffer.from(JSON.stringify(d)),'d.patron',a)).rejects.toThrow('SAVED_REVISION_MISMATCH');
 await expect(preparePublication(new Uint8Array([255]),'d.patron',a)).rejects.toThrow();
});
it('keeps the original binding as metadata without changing the editable revision',async()=>{
 const d=document(),revision=d.revisionId;d.remoteBinding={accountId:randomUUID(),patternId:randomUUID(),lastPublishedVersion:randomUUID()};
 const b=await preparePublication(Buffer.from(JSON.stringify(d)),'d.patron',await assets());expect(b.manifest.localRevisionId).toBe(revision);expect(b.document.remoteBinding).toEqual(d.remoteBinding);
});
