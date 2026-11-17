import {it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {pdfFixture} from '../support/pdf-fixture.js';
import {revisionId} from '../../packages/document/src/revision.js';
import {validateProduction} from '../../packages/print/src/validate.js';
import {printScene} from '../../packages/print/src/scene.js';
function fixture(){
 const {document,preparation}=pdfFixture(),original=document.pieces[0]!;
 const ids=new Map([original.id,...original.contour.points.map(p=>p.id),...original.contour.segments.map(s=>s.id)].map(id=>[id,randomUUID()]));
 const second=JSON.parse(JSON.stringify(original).replace(/[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}/g,id=>ids.get(id)??id)) as typeof original;
 second.name='Copia';document.pieces.push(second);preparation.selection.push(second.id);preparation.transforms[second.id]={x:200,y:0,rotation:0};document.revisionId=revisionId(document);
 return {document,preparation,original,second};
}
it('keeps identity, labels and translations of equal shapes and still rejects their overlap',()=>{
 const f=fixture(),scene=printScene(f.document,f.preparation.id);
 expect(scene.pieces.map(p=>p.id)).toEqual([f.original.id,f.second.id]);expect(scene.pieces.map(p=>p.name)).toEqual(['Delantero','Copia']);
 const a=scene.pieces[0]!.base[0]!.points[0]!,b=scene.pieces[1]!.base[0]!.points[0]!;expect(b.x-a.x).toBeCloseTo(200,6);expect(b.y).toBe(a.y);
 f.preparation.transforms[f.second.id]!.x=100;
 expect(validateProduction(f.document,f.preparation.id).issues.some(i=>i.code==='PIECES_OVERLAP'||i.code==='SEPARATION_BELOW_2MM')).toBe(true);
});
it('does not reuse an earlier evaluation or another width, topology, rotation or piece metadata',()=>{
 const f=fixture();expect(validateProduction(f.document,f.preparation.id).status).toBe('valid');
 f.second.name='';expect(validateProduction(f.document,f.preparation.id).issues.some(i=>i.pieceId===f.second.id&&i.code==='METADATA_REQUIRED')).toBe(true);f.second.name='Copia';
 f.second.seamWidth=3000;expect(validateProduction(f.document,f.preparation.id).status).not.toBe('valid');f.second.seamWidth=10;
 f.preparation.transforms[f.second.id]!.rotation=90;f.preparation.transforms[f.second.id]!.x=300;f.document.revisionId=revisionId(f.document);
 const scene=printScene(f.document,f.preparation.id),edge=scene.pieces[1]!.base[0]!.points;
 expect(edge[1]!.x).toBeCloseTo(edge[0]!.x,6);expect(edge[1]!.y-edge[0]!.y).toBeCloseTo(100,6);
 const duplicate={...f.second.contour.points[0]!,id:randomUUID()};f.second.contour.points.push(duplicate);f.second.contour.segments[0]!.startId=duplicate.id;
 expect(validateProduction(f.document,f.preparation.id).issues.some(i=>i.pieceId===f.second.id&&i.code==='CONTOUR_INVALID')).toBe(true);
});
it('preserves sub-millimetre placement when repeated rotated shapes have a huge common translation',()=>{
 const f=fixture();
 f.preparation.transforms[f.original.id]={x:1e12,y:1e12,rotation:90};
 f.preparation.transforms[f.second.id]={x:1e12+200.125,y:1e12+0.25,rotation:90};
 f.document.revisionId=revisionId(f.document);
 const scene=printScene(f.document,f.preparation.id),a=scene.pieces[0]!,b=scene.pieces[1]!;
 for(const field of ['base','exterior'] as const)for(let i=0;i<a[field].length;i++)for(let j=0;j<a[field][i]!.points.length;j++){
  expect(b[field][i]!.points[j]!.x-a[field][i]!.points[j]!.x).toBeCloseTo(200.125,7);
  expect(b[field][i]!.points[j]!.y-a[field][i]!.points[j]!.y).toBeCloseTo(0.25,7);
 }
});
