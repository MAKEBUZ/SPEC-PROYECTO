import {it,expect} from 'vitest';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {pdfFixture} from '../support/pdf-fixture.js';
import {createPrintPdf,PDF_PROFILE} from '../../packages/print/src/pdf.js';
import {PdfArtifactStore} from '../../apps/desktop/src/main/publication/pdf-artifact-store.js';
import {isolatedPdfVerifier} from '../../apps/desktop/src/main/print/pdf-verifier.js';
import {pathToFileURL} from 'node:url';
const verifyPdfIsolated=isolatedPdfVerifier(pathToFileURL(resolve('dist/apps/desktop/src/main/print/export-runner.js')));
it('persists and reopens a PDF catalog using real isolated verification',async()=>{
 const root=await mkdtemp(join(tmpdir(),'patron-pdf-catalog-'));
 try{
  const {document,preparation}=pdfFixture(),saved=Buffer.from(JSON.stringify(document)),generated=await createPrintPdf(document,preparation.id,{font:await readFile('.local/assets/NotoSans-Regular.ttf')});
  const store=new PdfArtifactStore(root,verifyPdfIsolated),artifact=await store.persist(saved,preparation.id,generated.bytes,PDF_PROFILE.id);
  const reopened=new PdfArtifactStore(root,verifyPdfIsolated);expect((await reopened.list(document)).map(v=>v.id)).toEqual([artifact.id]);expect((await reopened.select(document,[artifact.id]))[0]!.bytes).toEqual(Buffer.from(generated.bytes));
  await expect(store.persist(saved,preparation.id,generated.bytes,'unknown')).rejects.toThrow('EXPORT_PROFILE_UNSUPPORTED');
  const controller=new AbortController(),started=performance.now(),pending=store.persist(saved,preparation.id,generated.bytes,PDF_PROFILE.id,controller.signal),timer=setTimeout(()=>controller.abort(),10);
  try{await expect(pending).rejects.toThrow();expect(performance.now()-started).toBeLessThan(5000);}finally{clearTimeout(timer);}
  expect((await reopened.list(document)).map(v=>v.id)).toEqual([artifact.id]);
 }finally{if(!resolve(root).startsWith(resolve(tmpdir())+sep))throw Error('Unexpected test directory');await rm(root,{recursive:true,force:true});}
},30000);
