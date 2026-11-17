import {it,expect,vi} from 'vitest';
import {readFile,mkdtemp,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {ExportJob,attestedExport} from '../../apps/desktop/src/main/print/export-job.js';
import {PdfArtifactStore} from '../../apps/desktop/src/main/publication/pdf-artifact-store.js';
import {verifyPrintPdf} from '../../packages/print/src/verify.js';
import {pdfFixture} from '../support/pdf-fixture.js';

it('binds catalog reuse to the live verified result, bytes, revision and preparation; publication verifies again',async()=>{
 const root=await mkdtemp(join(tmpdir(),'patron-attestation-'));
 try{
  const {document,preparation}=pdfFixture(),saved=Buffer.from(JSON.stringify(document));
  const result=await new ExportJob(saved,preparation.id,await readFile('.local/assets/NotoSans-Regular.ttf'),pathToFileURL(resolve('dist/apps/desktop/src/main/print/export-runner.js'))).finished;
  if(!result)throw Error('Expected verified export');
  const verify=vi.fn(async(bytes:Uint8Array)=>verifyPrintPdf(bytes,document,preparation.id)),store=new PdfArtifactStore(root,verify);
  await expect(store.persistExport(saved,preparation.id,structuredClone(result))).rejects.toThrow('PDF_EXPORT_ATTESTATION_INVALID');
  await expect(store.persistExport(Buffer.from(saved.toString()+' '),preparation.id,result)).rejects.toThrow('PDF_EXPORT_ATTESTATION_INVALID');
  await expect(store.persistExport(saved,'other-preparation',result)).rejects.toThrow('PDF_EXPORT_ATTESTATION_INVALID');
  const first=result.bytes[0]!;result.bytes[0]=first^1;
  await expect(store.persistExport(saved,preparation.id,result)).rejects.toThrow('PDF_EXPORT_ATTESTATION_INVALID');result.bytes[0]=first;
  const width=result.measurement.pages[0]!.widthMm;result.measurement.pages[0]!.widthMm=width+1;
  await expect(store.persistExport(saved,preparation.id,result)).rejects.toThrow('PDF_EXPORT_ATTESTATION_INVALID');result.measurement.pages[0]!.widthMm=width;
  const copy=attestedExport(result,saved,preparation.id);copy.pages[0]!.widthMm++;
  expect(attestedExport(result,saved,preparation.id).pages[0]!.widthMm).toBe(width);
  await expect(new PdfArtifactStore(root).persistExport(saved,preparation.id,result)).rejects.toThrow('PDF_VERIFIER_UNAVAILABLE');
  const abort=new AbortController();abort.abort();await expect(store.persistExport(saved,preparation.id,result,abort.signal)).rejects.toThrow();
  expect(await readdir(root)).toEqual([]);
  const artifact=await store.persistExport(saved,preparation.id,result);expect(verify).not.toHaveBeenCalled();
  expect((await store.read(artifact.id)).bytes).toEqual(Buffer.from(result.bytes));
  await store.select(document,[artifact.id]);expect(verify).toHaveBeenCalledTimes(1);
  await store.persist(saved,preparation.id,result.bytes,result.measurement.exportProfileId);expect(verify).toHaveBeenCalledTimes(2);
 }finally{if(!resolve(root).startsWith(resolve(tmpdir(),'patron-attestation-')))throw Error('Unsafe cleanup');await rm(root,{recursive:true,force:true});}
},30000);
