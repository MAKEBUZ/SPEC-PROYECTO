import {expect,it} from 'vitest';
import {randomUUID as id} from 'node:crypto';
import {createPiece} from '../../packages/document/src/piece.js';
import {certifiedSeparation} from '../../packages/print/src/certified-separation.js';
import {validateProduction} from '../../packages/print/src/validate.js';
function polygon(coords:number[][]){
 const points=coords.map(([x,y])=>({id:id(),x:x!,y:y!}));
 return createPiece(id(),{points,segments:points.map((p,i)=>({id:id(),kind:'line',startId:p.id,endId:points[(i+1)%points.length]!.id}))});
}
it.each([0,.25].flatMap(width=>[0,-(2**-30),2**-30].map(delta=>({width,delta}))))('certifies a curved U without a global separating line: $width, $delta',({width,delta})=>{
 const a=polygon([[-10,-10],[10,-10],[10,10],[6,10],[6,0],[-6,0],[-6,10],[-10,10]]);
 a.contour.segments[4]={...a.contour.segments[4]!,kind:'cubic',handleStart:{x:2,y:4},handleEnd:{x:-2,y:4}};
 const b=polygon([[-3,5+2*width+delta],[3,5+2*width+delta],[3,8],[-3,8]]);
 a.seamWidth=width;b.seamWidth=width;
 const before=structuredClone([a,b]),t={x:0,y:0,rotation:0};
 expect(certifiedSeparation(a,t,b,t)).toBe(delta<0?'too-close':'valid');
 expect(certifiedSeparation(b,t,a,t)).toBe(delta<0?'too-close':'valid');
 expect([a,b]).toEqual(before);
},60000);
it.each([0,.25])('validates facing curved boundaries in a concavity at exactly 2 mm, margin %s',width=>{
 const a=polygon([[-10,-10],[10,-10],[10,10],[6,10],[6,0],[-6,0],[-6,10],[-10,10]]);
 a.contour.segments[4]={...a.contour.segments[4]!,kind:'cubic',handleStart:{x:2,y:4},handleEnd:{x:-2,y:4}};
 const b=polygon([[-3,6.5+2*width],[3,6.5+2*width],[3,9],[-3,9]]);
 b.contour.segments[0]={...b.contour.segments[0]!,kind:'cubic',handleStart:{x:-1,y:4.5+2*width},handleEnd:{x:1,y:4.5+2*width}};
 for(const piece of [a,b]){piece.seamWidth=width;piece.name='Curva';piece.sizeLabel='M';piece.cutQuantity=1;piece.grainline={start:{x:0,y:0},end:{x:0,y:1}};}
 const t={x:13,y:17,rotation:90},preparation={id:id(),name:'Cóncava',selection:[a.id,b.id],transforms:{[a.id]:t,[b.id]:t},mode:'large',paper:'A4',margin:10};
 const document={formatVersion:1,documentId:id(),revisionId:'0'.repeat(64),units:'mm',pieces:[a,b],preparations:[preparation]},before=structuredClone(document);
 const result=validateProduction(document,preparation.id);
 expect(result.issues).toEqual([]);expect(result.status).toBe('valid');expect(document).toEqual(before);
 const enclosing=polygon([[-30,-30],[30,-30],[30,30],[-30,30]]),origin={x:0,y:0,rotation:0};
 expect(certifiedSeparation(a,origin,enclosing,origin)).toBe('overlap');
},60000);
