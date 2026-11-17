import {it,expect} from 'vitest';
import {mkdtemp,rm,readFile,writeFile,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {PdfArtifactStore,type PdfVerifier} from '../../apps/desktop/src/main/publication/pdf-artifact-store.js';
import {revisionId} from '../../packages/document/src/revision.js';
const verifier:PdfVerifier=async()=>({exportProfileId:'test-only',scale:1,pages:[{widthMm:210,heightMm:297}]});
async function fixture(run:(root:string)=>Promise<void>){const root=await mkdtemp(join(tmpdir(),'pdf-artifact-'));try{await run(root);}finally{await rm(root,{recursive:true,force:true});}}
function source(){const document={formatVersion:1 as const,documentId:randomUUID(),revisionId:'0'.repeat(64),units:'mm' as const,pieces:[],preparations:[{id:randomUUID(),name:'P',selection:[],transforms:{},mode:'large',paper:'A4',margin:10}]};document.revisionId=revisionId(document);return {document,id:document.preparations[0]!.id,saved:Buffer.from(JSON.stringify(document)),bytes:Buffer.from('test fixture, NOT a production PDF')};}
it('persists immutable origins across restart and selects only the same saved revision',async()=>fixture(async root=>{
 const s=source(),store=new PdfArtifactStore(root,verifier),artifact=await store.persist(s.saved,s.id,s.bytes,'test-only');
 const again=new PdfArtifactStore(root,verifier);expect(await again.list(s.document)).toEqual([artifact]);expect((await again.select(s.document,[artifact.id]))[0]!.bytes).toEqual(s.bytes);
 expect(await again.persist(s.saved,s.id,s.bytes,'test-only')).toEqual(artifact);
 const original=await readFile(join(root,artifact.id+'.json'));s.document.preparations[0]!.margin=11;s.document.revisionId=revisionId(s.document);
 expect(await again.list(s.document)).toEqual([]);await expect(again.select(s.document,[artifact.id])).rejects.toThrow('PDF_ORIGIN_MISMATCH');expect(await readFile(join(root,artifact.id+'.json'))).toEqual(original);
}));
it('rejects corrupted bytes and metadata instead of repairing or relinking them',async()=>fixture(async root=>{
 const s=source(),store=new PdfArtifactStore(root,verifier),artifact=await store.persist(s.saved,s.id,s.bytes,'test-only');
 await writeFile(join(root,artifact.id+'.pdf'),'corrupt');await expect(store.select(s.document,[artifact.id])).rejects.toThrow('PDF_ARTIFACT_CORRUPT');
 await expect(store.persist(s.saved,s.id,s.bytes,'test-only')).rejects.toThrow('PDF_ARTIFACT_CORRUPT');
 await writeFile(join(root,artifact.id+'.json'),'{}');await expect(store.read(artifact.id)).rejects.toThrow();
}));
it('denies missing/failed verification and ignores uncommitted binaries',async()=>fixture(async root=>{
 const s=source();await expect(new PdfArtifactStore(root).persist(s.saved,s.id,s.bytes,'test-only')).rejects.toThrow('PDF_VERIFIER_UNAVAILABLE');
 const failed=new PdfArtifactStore(root,async()=>{throw Error('PRODUCTION_INVALID');});await expect(failed.persist(s.saved,s.id,s.bytes,'test-only')).rejects.toThrow('PRODUCTION_INVALID');expect(await readdir(root)).toEqual([]);
 await writeFile(join(root,'a'.repeat(64)+'.pdf'),s.bytes);expect(await failed.list(s.document)).toEqual([]);
}));
it('revalidates selection and rejects duplicates, path injection and changed measurements',async()=>fixture(async root=>{
 const s=source(),store=new PdfArtifactStore(root,verifier),a=await store.persist(s.saved,s.id,s.bytes,'test-only');
 await expect(store.select(s.document,[a.id,a.id])).rejects.toThrow('PDF_SELECTION_DUPLICATE');await expect(store.read('../escape')).rejects.toThrow('PDF_ARTIFACT_INVALID');
 await expect(new PdfArtifactStore(root).select(s.document,[a.id])).rejects.toThrow('PDF_VERIFIER_UNAVAILABLE');
 const changed=new PdfArtifactStore(root,async()=>({...await verifier(s.bytes,s.document,s.id,'test-only'),pages:[{widthMm:211,heightMm:297}]}));await expect(changed.select(s.document,[a.id])).rejects.toThrow('PDF_ARTIFACT_MISMATCH');
}));
