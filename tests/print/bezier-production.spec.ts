import {expect,it} from 'vitest';
import {AlgebraicContext} from '../../packages/geometry/src/algebraic.js';
import {offsetCriticalParameters,evaluateDerivedOffset} from '../../packages/geometry/src/offset-intersections.js';
import {randomUUID as id} from 'node:crypto';
import {createPiece} from '../../packages/document/src/piece.js';
import {certifiedSeparation} from '../../packages/print/src/certified-separation.js';
import {validateProduction} from '../../packages/print/src/validate.js';
import {algebraicSeparation} from '../../packages/print/src/algebraic-separation.js';
function curved(){
 const points=[{id:id(),x:0,y:0},{id:id(),x:3,y:3},{id:id(),x:0,y:3}];
 const p=createPiece(id(),{points,segments:[{id:id(),kind:'cubic',startId:points[0]!.id,endId:points[1]!.id,handleStart:{x:1,y:0},handleEnd:{x:2,y:1}},{id:id(),kind:'line',startId:points[1]!.id,endId:points[2]!.id},{id:id(),kind:'line',startId:points[2]!.id,endId:points[0]!.id}]});
 p.name='Curva';p.sizeLabel='M';p.cutQuantity=1;p.grainline={start:{x:0,y:1},end:{x:0,y:2}};p.seamWidth=.1;return p;
}
it.each([0,-(2**-36),2**-36])('certifies the exact oblique normal gap between positive offsets: %s',delta=>{
 const a=curved(),b=curved();a.seamWidth=.25;b.seamWidth=.25-delta;
 // At t=u=3/8 the base tangent is (3,9/4), and the connecting
 // base normal is (3/2,-2), length 5/2. Subtract both 1/4 offsets.
 expect(algebraicSeparation(a,{x:0,y:0,rotation:0},b,{x:3.75,y:-1.15625,rotation:180})).toBe(delta>=0?'valid':'too-close');
 expect(certifiedSeparation(a,{x:0,y:0,rotation:0},b,{x:3.75,y:-1.15625,rotation:180})).toBe(delta>=0?'valid':'too-close');
 const preparation={id:id(),name:'Límite exacto',selection:[a.id,b.id],transforms:{[a.id]:{x:0,y:0,rotation:0},[b.id]:{x:3.75,y:-1.15625,rotation:180}},mode:'large',paper:'A4',margin:10};
 const document={formatVersion:1,documentId:id(),revisionId:'0'.repeat(64),units:'mm',pieces:[a,b],preparations:[preparation]},before=structuredClone(document);
 const result=validateProduction(document,preparation.id);
 expect(result.status).toBe(delta>=0?'valid':'invalid');
 expect(result.issues.map(issue=>issue.code)).toEqual(delta>=0?[]:['SEPARATION_BELOW_2MM']);
 expect(document).toEqual(before);
},30000);
it('finds extrema along a rotated axis without rounding the offset control geometry',()=>{
 const f=new AlgebraicContext(),curve={controls:[{x:0,y:0},{x:1,y:0},{x:2,y:1},{x:3,y:3}],width:1,winding:1 as const};
 const parameters=offsetCriticalParameters(f,curve,[{x:1,y:-1}]);expect(parameters.some(t=>f.compare(t,f.number(.5))===0)).toBe(true);
 const at=evaluateDerivedOffset(f,curve,f.number(.5)),expected=f.add(f.number(.75),f.sqrt(f.number(2)));
 expect(f.compare(f.sub(at.x,at.y),expected)).toBe(0);
});
it.each([[7,'valid'],[6,'too-close']] as const)('certifies positive offsets across facing Bézier boundaries at translation %s',async(x,expected)=>{
 const a=curved(),b=curved(),before=structuredClone([a,b]);
 expect(certifiedSeparation(a,{x:0,y:0,rotation:0},b,{x,y:3,rotation:180})).toBe(expected);expect([a,b]).toEqual(before);
},30000);
it('validates a positive Bézier offset after a non-cardinal rotation',()=>{
 const piece=curved(),preparation={id:id(),name:'Rotada',selection:[piece.id],transforms:{[piece.id]:{x:10,y:20,rotation:45}},mode:'large',paper:'A4',margin:10};
 const document={formatVersion:1,documentId:id(),revisionId:'0'.repeat(64),units:'mm',pieces:[piece],preparations:[preparation]},before=structuredClone(document);
 const result=validateProduction(document,preparation.id);expect(result.issues).toEqual([]);expect(result.status).toBe('valid');expect(document).toEqual(before);
},30000);
it('detects containment even when the certified Bézier boundaries are more than 2 mm apart',()=>{
 const a=curved(),points=[[0,0],[20,0],[20,20],[0,20]].map(([x,y])=>({id:id(),x:x!,y:y!}));
 const b=createPiece(id(),{points,segments:points.map((p,i)=>({id:id(),kind:'line',startId:p.id,endId:points[(i+1)%4]!.id}))});
 expect(certifiedSeparation(a,{x:5,y:5,rotation:0},b,{x:0,y:0,rotation:0})).toBe('overlap');
},30000);

