import {it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {revisionId} from '../../packages/document/src/revision.js';
import {createPdfArtifact,assertPdfOrigin} from '../../packages/document/src/pdf-artifact.js';
const document=()=>{const d={formatVersion:1 as const,documentId:randomUUID(),revisionId:'0'.repeat(64),units:'mm' as const,pieces:[],preparations:[{id:randomUUID(),name:'Impresión',selection:[],transforms:{},mode:'large',paper:'A4',margin:10}]};d.revisionId=revisionId(d);return d;};
const proof={exportProfileId:'test-only',scale:1 as const,pages:[{widthMm:210,heightMm:297}]};
it('binds immutable metadata to the saved revision and preparation, without changing either',()=>{
 const d=document(),before=structuredClone(d),a=createPdfArtifact(d,String(d.preparations[0]!.id),Buffer.from('fixture'),proof);
 expect(d).toEqual(before);expect(Object.isFrozen(a)).toBe(true);expect(Object.isFrozen(a.pages[0])).toBe(true);assertPdfOrigin(a,d);
 const changed=structuredClone(d);changed.preparations[0]!.margin=12;changed.revisionId=revisionId(changed);expect(()=>assertPdfOrigin(a,changed)).toThrow('PDF_ORIGIN_MISMATCH');expect(a.revisionId).toBe(before.revisionId);
});
it('rejects unsaved content, unknown preparation, wrong scale and invalid dimensions',()=>{
 const d=document(),id=String(d.preparations[0]!.id);d.preparations[0]!.name='Editada';expect(()=>createPdfArtifact(d,id,Buffer.from('x'),proof)).toThrow('SAVED_REVISION_MISMATCH');d.revisionId=revisionId(d);
 expect(()=>createPdfArtifact(d,randomUUID(),Buffer.from('x'),proof)).toThrow('PREPARATION_NOT_FOUND');
 for(const p of [{...proof,scale:2},{...proof,pages:[]},{...proof,pages:[{widthMm:Infinity,heightMm:10}]}])expect(()=>createPdfArtifact(d,id,Buffer.from('x'),p)).toThrow();
});
