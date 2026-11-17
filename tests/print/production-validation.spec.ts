import {it,expect} from 'vitest';
import {randomUUID as id} from 'node:crypto';
import {createPiece} from '../../packages/document/src/piece.js';
import {validateProduction} from '../../packages/print/src/validate.js';
function box(w=10,h=10){const points=[[0,0],[w,0],[w,h],[0,h]].map(([x,y])=>({id:id(),x:x!,y:y!}));const p=createPiece(id(),{points,segments:points.map((p,i)=>({id:id(),kind:'line' as const,startId:p.id,endId:points[(i+1)%4]!.id}))});p.name='P';p.sizeLabel='M';p.cutQuantity=1;p.grainline={start:{x:1,y:1},end:{x:1,y:2}};return p;}
function fixture(pieces=[box()]){const preparation={id:id(),name:'Impresión',selection:pieces.map(p=>p.id),transforms:Object.fromEntries(pieces.map((p,i)=>[p.id,{x:i*12,y:0,rotation:0}])),mode:'large',paper:'A4',margin:10};return {document:{formatVersion:1 as const,documentId:id(),revisionId:'0'.repeat(64),units:'mm' as const,pieces,preparations:[preparation]},preparation};}
it('validates only selected pieces but always validates document structure',()=>{
 const f=fixture(),draft=box();draft.name='';draft.contour.segments.pop();f.document.pieces.push(draft);const before=structuredClone(f.document);
 expect(validateProduction(f.document,f.preparation.id).status).toBe('valid');expect(f.document).toEqual(before);
 f.preparation.selection.push(draft.id);f.preparation.transforms[draft.id]={x:40,y:0,rotation:0};expect(validateProduction(f.document,f.preparation.id).status).toBe('invalid');
 f.preparation.selection.pop();delete f.preparation.transforms[draft.id];draft.contour.points[0]!.x=Infinity;expect(validateProduction(f.document,f.preparation.id).status).toBe('invalid');
});
it.each([2,2-2**-40,2+2**-40])('classifies exact gap %s without epsilon',gap=>{
 const f=fixture([box(),box()]);f.preparation.transforms[f.document.pieces[1]!.id]!.x=10+gap;
 expect(validateProduction(f.document,f.preparation.id).status).toBe(gap>=2?'valid':'invalid');
});
it('detects crossings and nested pieces even if their edges are separated',()=>{
 for(const [w,x] of [[10,5],[2,4]]){const f=fixture([box(),box(w,w)]);f.preparation.transforms[f.document.pieces[1]!.id]={x:x!,y:x!,rotation:0};expect(validateProduction(f.document,f.preparation.id).status).toBe('invalid');}
});
it('includes seam margins and preserves requested geometry',()=>{
 const a=box(),b=box();a.seamWidth=1;b.seamWidth=1;const f=fixture([a,b]);
 expect(validateProduction(f.document,f.preparation.id).status).toBe('invalid');f.preparation.transforms[b.id]!.x=14;expect(validateProduction(f.document,f.preparation.id).status).toBe('valid');expect(a.seamWidth).toBe(1);
});
it('accepts inclusive piece and composition limits and rejects excess',()=>{
 const f=fixture([box(5000,10),box(4998,10)]);f.preparation.transforms[f.document.pieces[1]!.id]!.x=5002;
 expect(validateProduction(f.document,f.preparation.id).status).toBe('valid');f.preparation.transforms[f.document.pieces[1]!.id]!.x+=2**-30;expect(validateProduction(f.document,f.preparation.id).status).toBe('invalid');
 const tooLarge=fixture([box(5000+2**-30,10)]);expect(validateProduction(tooLarge.document,tooLarge.preparation.id).status).toBe('invalid');
});
it('reports missing metadata and references, and accepts positive tiny areas',()=>{
 const f=fixture();f.document.pieces[0]!.cutQuantity=1.5;expect(validateProduction(f.document,f.preparation.id).issues.some(i=>i.detail==='cutQuantity')).toBe(true);
 f.document.pieces=[];expect(validateProduction(f.document,f.preparation.id).issues.some(i=>i.code==='PIECE_MISSING')).toBe(true);
 const tiny=fixture([box(2**-40,2**-40)]);expect(validateProduction(tiny.document,tiny.preparation.id).status).toBe('valid');
});
it('requires 1–100 selections and accepts 100',()=>{
 for(const n of [0,100,101]){const f=fixture(Array.from({length:n},()=>box()));expect(validateProduction(f.document,f.preparation.id).status).toBe(n===100?'valid':'invalid');}
});
it('rotates placement without changing the base and includes page limits',()=>{
 const f=fixture([box(10,20)]);f.preparation.transforms[f.document.pieces[0]!.id]!.rotation=90;const before=structuredClone(f.document);expect(validateProduction(f.document,f.preparation.id).status).toBe('valid');expect(f.document).toEqual(before);
 const big=fixture([box(5000,5000)]);big.preparation.mode='tiled';expect(validateProduction(big.document,big.preparation.id).issues.some(i=>i.code==='LAYOUT_INVALID')).toBe(true);
});
it('uses true Bézier extrema for rotated placement and certifies distant curves',()=>{
 const curved=box(),edge=curved.contour.segments[0]!;curved.contour.segments[0]={...edge,kind:'cubic',handleStart:{x:2,y:-2},handleEnd:{x:8,y:-2}};
 const f=fixture([curved,box()]);f.preparation.transforms[curved.id]!.rotation=30;f.preparation.transforms[f.document.pieces[1]!.id]!.x=50;
 expect(validateProduction(f.document,f.preparation.id).status).toBe('valid');
 f.preparation.transforms[f.document.pieces[1]!.id]!.x=5;const result=validateProduction(f.document,f.preparation.id);expect(result.status).toBe('invalid');expect(result.issues.some(i=>i.code==='SEPARATION_BELOW_2MM')).toBe(true);
},30000);
it('handles round margins without treating their bounding boxes as filled pieces',()=>{
 const a=box(),b=box();a.seamWidth=1;for(const point of a.contour.points)a.cornerJoins[point.id]='round';const f=fixture([a,b]);f.preparation.transforms[b.id]!.x=13;
 expect(validateProduction(f.document,f.preparation.id).status).toBe('valid');f.preparation.transforms[b.id]!.x=12;
 expect(validateProduction(f.document,f.preparation.id).status).toBe('invalid');
});
it.each([0,-(2**-40),2**-40])('resolves diagonal round margins with exact 2 mm boundary (%s)',delta=>{
 const a=box(),b=box();for(const p of [a,b]){p.seamWidth=1.5;for(const point of p.contour.points)p.cornerJoins[point.id]='round';}
 const f=fixture([a,b]);f.preparation.transforms[b.id]={x:13+delta,y:14,rotation:0};
 expect(validateProduction(f.document,f.preparation.id).status).toBe(delta>=0?'valid':'invalid');
});
it('certifies separated round corners despite nearby bounding boxes and supports rotation',()=>{
 const a=box(),b=box();a.seamWidth=1;for(const point of a.contour.points)a.cornerJoins[point.id]='round';const f=fixture([a,b]);f.preparation.transforms[b.id]={x:12.2,y:12.2,rotation:0};expect(validateProduction(f.document,f.preparation.id).status).toBe('valid');
 f.preparation.selection=[a.id];delete f.preparation.transforms[b.id];f.preparation.transforms[a.id]!.rotation=30;expect(validateProduction(f.document,f.preparation.id).status).toBe('valid');
},30000);
it('rejects an open contour, zero-length segment, null area and crossings without repair',()=>{
 for(const mutate of [(p:ReturnType<typeof box>)=>{p.contour.segments.pop();},(p:ReturnType<typeof box>)=>{p.contour.points[1]!.x=0;},(p:ReturnType<typeof box>)=>{for(const point of p.contour.points)point.y=0;},(p:ReturnType<typeof box>)=>{p.contour.points[1]!.y=10;p.contour.points[2]!.y=0;}]){
  const p=box();mutate(p);const f=fixture([p]),before=structuredClone(f.document);expect(validateProduction(f.document,f.preparation.id).status).toBe('invalid');expect(f.document).toEqual(before);
 }
});
it('enforces all required metadata, without requiring cut-on-fold',()=>{
 const f=fixture(),p=f.document.pieces[0]!;p.name=' ';p.sizeLabel='';p.cutQuantity=0;p.grainline=null;
 expect(validateProduction(f.document,f.preparation.id).issues.filter(i=>i.code==='METADATA_REQUIRED').map(i=>i.detail)).toEqual(['name','sizeLabel','cutQuantity','grainline']);
});
