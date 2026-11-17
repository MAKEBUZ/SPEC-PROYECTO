import {it,expect} from 'vitest';
import {AlgebraicContext} from '../../packages/geometry/src/algebraic.js';
import type {DerivedPrimitive,DerivedArc} from '../../packages/geometry/src/derived-path.js';
import {pathSeparation} from '../../packages/print/src/path-separation.js';
function circle(f:AlgebraicContext,x:number,y:number,r:number,winding:1|-1=1):DerivedArc[]{
 const points=[[x+r,y],[x,y+r],[x-r,y],[x,y-r]];if(winding===-1)points.reverse();
 return points.map((p,i)=>({kind:'arc',sourceId:String(i),center:{x:f.number(x),y:f.number(y)},radius:f.number(r),winding,start:{x:f.number(p[0]!),y:f.number(p[1]!)},end:{x:f.number(points[(i+1)%4]![0]!),y:f.number(points[(i+1)%4]![1]!)}}));
}
it.each([1,-1] as const)('detects containment of disjoint circular boundaries with winding %s',winding=>{
 const f=new AlgebraicContext();expect(pathSeparation(f,circle(f,0,0,10,winding),circle(f,0,0,1,-1))).toBe('overlap');
});
it.each([0,-(2**-40),2**-40])('compares diagonal circular separation to 2 exactly: %s',delta=>{
 const f=new AlgebraicContext();expect(pathSeparation(f,circle(f,0,0,1.5),circle(f,3+delta,4,1.5))).toBe(delta>=0?'valid':'too-close');
});
it('detects crossing circular boundaries and a line piercing an arc',()=>{
 const f=new AlgebraicContext();expect(pathSeparation(f,circle(f,0,0,2),circle(f,3,0,2))).toBe('overlap');
 const points=[[-3,-0.5],[3,-0.5],[3,0.5],[-3,0.5]],rectangle:DerivedPrimitive[]=points.map((p,i)=>({kind:'line',sourceId:String(i),start:{x:f.number(p[0]!),y:f.number(p[1]!)},end:{x:f.number(points[(i+1)%4]![0]!),y:f.number(points[(i+1)%4]![1]!)}}));
 expect(pathSeparation(f,circle(f,0,0,2),rectangle)).toBe('overlap');
});

