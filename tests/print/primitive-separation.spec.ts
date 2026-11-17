import {expect,it} from 'vitest';
import {AlgebraicContext} from '../../packages/geometry/src/algebraic.js';
import {primitiveSeparation} from '../../packages/print/src/primitive-separation.js';
import {evaluateDerivedOffset} from '../../packages/geometry/src/offset-intersections.js';
import {randomUUID as id} from 'node:crypto';
import {createPiece} from '../../packages/document/src/piece.js';
import {validateProduction} from '../../packages/print/src/validate.js';
it.each([0,-(2**-30),2**-30])('decides an arch around a line with no separating support: %s',delta=>{
 const f=new AlgebraicContext(),radius=2+delta,curve={controls:[{x:-radius,y:0},{x:-radius,y:4},{x:radius,y:4},{x:radius,y:0}],width:0,winding:1 as const};
 const a={kind:'offset' as const,sourceId:'a',curve,from:f.zero,to:f.one,start:evaluateDerivedOffset(f,curve,f.zero),end:evaluateDerivedOffset(f,curve,f.one)};
 const b={kind:'line' as const,sourceId:'b',start:{x:f.zero,y:f.number(-1)},end:{x:f.zero,y:f.zero}},identity=(v:typeof b.start)=>v;
 expect(primitiveSeparation(f,a,identity,b,identity)).toBe(delta<0?'too-close':'valid');
});
it('certifies a positive offset arch with the complete-domain base-distance bound',()=>{
 const f=new AlgebraicContext(),curve={controls:[{x:-2.25,y:0},{x:-2.25,y:4.5},{x:2.25,y:4.5},{x:2.25,y:0}],width:.25,winding:1 as const};
 const a={kind:'offset' as const,sourceId:'a',curve,from:f.zero,to:f.one,start:evaluateDerivedOffset(f,curve,f.zero),end:evaluateDerivedOffset(f,curve,f.one)};
 const b={kind:'line' as const,sourceId:'b',start:{x:f.zero,y:f.number(-1)},end:{x:f.zero,y:f.zero}},identity=(v:typeof b.start)=>v;
 expect(primitiveSeparation(f,a,identity,b,identity)).toBe('valid');
});
it('uses the positive radical branch when the base-distance bound cannot certify an outward curved offset',()=>{
 const f=new AlgebraicContext(),curve={controls:[{x:-2,y:0},{x:-2,y:4},{x:2,y:4},{x:2,y:0}],width:.25,winding:-1 as const};
 const a={kind:'offset' as const,sourceId:'a',curve,from:f.zero,to:f.one,start:evaluateDerivedOffset(f,curve,f.zero),end:evaluateDerivedOffset(f,curve,f.one)};
 const b={kind:'line' as const,sourceId:'b',start:{x:f.zero,y:f.number(-1)},end:{x:f.zero,y:f.zero}},identity=(v:typeof b.start)=>v;
 expect(primitiveSeparation(f,a,identity,b,identity)).toBe('valid');
},30000);
it.each([0,-(2**-30)])('resolves an even stationary tangent and a continuum of closest points: %s',delta=>{
 const f=new AlgebraicContext(),curve={controls:[{x:-.125,y:0},{x:.125,y:0},{x:-.125,y:0},{x:.125,y:0}],width:1,winding:1 as const};
 const a={kind:'offset' as const,sourceId:'a',curve,from:f.zero,to:f.one,start:evaluateDerivedOffset(f,curve,f.zero),end:evaluateDerivedOffset(f,curve,f.one)};
 const b={kind:'line' as const,sourceId:'b',start:{x:f.number(-1),y:f.number(1+delta)},end:{x:f.one,y:f.number(1+delta)}},identity=(v:typeof b.start)=>v;
 expect(primitiveSeparation(f,a,identity,b,identity)).toBe(delta<0?'too-close':'valid');
});
it('resolves concentric arc components with a continuum at exactly 2 mm',()=>{
 const f=new AlgebraicContext(),arc=(r:number)=>({kind:'arc' as const,sourceId:String(r),start:{x:f.number(r),y:f.zero},end:{x:f.zero,y:f.number(r)},center:{x:f.zero,y:f.zero},radius:f.number(r),winding:1 as const}),identity=(p:{x:typeof f.zero;y:typeof f.zero})=>p;
 expect(primitiveSeparation(f,arc(1),identity,arc(3),identity)).toBe('valid');
},30000);
it('integrates the full-domain fallback for two pieces whose closest sources have no separating support',()=>{
 const make=(coords:number[][])=>{const points=coords.map(([x,y])=>({id:id(),x:x!,y:y!}));return createPiece(id(),{points,segments:points.map((p,i)=>({id:id(),kind:'line',startId:p.id,endId:points[(i+1)%points.length]!.id}))});};
 const a=make([[-2,0],[2,0],[4,0],[4,6],[-4,6],[-4,0]]),b=make([[0,0],[.25,-3],[-.25,-3]]);
 a.contour.segments[0]={...a.contour.segments[0]!,kind:'cubic',handleStart:{x:-2,y:4},handleEnd:{x:2,y:4}};
 b.contour.segments[0]={...b.contour.segments[0]!,kind:'cubic',handleStart:{x:0,y:-1},handleEnd:{x:0,y:-2}};
 b.contour.segments[2]={...b.contour.segments[2]!,kind:'cubic',handleStart:{x:0,y:-2},handleEnd:{x:0,y:-1}};
 for(const p of [a,b]){p.name='Curva';p.sizeLabel='M';p.cutQuantity=1;p.grainline={start:{x:0,y:0},end:{x:0,y:1}};}
 const transform={x:0,y:0,rotation:0},preparation={id:id(),name:'Sin soporte local',selection:[a.id,b.id],transforms:{[a.id]:transform,[b.id]:transform},mode:'large',paper:'A4',margin:10};
 const document={formatVersion:1,documentId:id(),revisionId:'0'.repeat(64),units:'mm',pieces:[a,b],preparations:[preparation]},before=structuredClone(document);
 const result=validateProduction(document,preparation.id);expect(result.issues).toEqual([]);expect(result.status).toBe('valid');expect(document).toEqual(before);
},60000);
