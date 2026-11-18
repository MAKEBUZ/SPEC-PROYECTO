import {it,expect} from 'vitest';
import {AlgebraicContext} from '../../packages/geometry/src/algebraic.js';
import {lineDistanceSquared} from '../../packages/print/src/separation.js';
import {primitiveIntersections} from '../../packages/geometry/src/derived-path.js';
it('retains distances for certified approximation edges that collapse to points',()=>{
 const f=new AlgebraicContext(),p=(x:number,y:number)=>({x:f.number(x),y:f.number(y)});
 const point={kind:'line' as const,sourceId:'a',start:p(0,0),end:p(0,0)},line={kind:'line' as const,sourceId:'b',start:p(-1,2),end:p(1,2)};
 expect(f.compare(lineDistanceSquared(f,point,line),f.number(4))).toBe(0);
 expect(f.compare(lineDistanceSquared(f,line,point),f.number(4))).toBe(0);
 expect(f.compare(lineDistanceSquared(f,point,{...point,start:p(3,4),end:p(3,4)}),f.number(25))).toBe(0);
 expect(f.sign(lineDistanceSquared(f,point,point))).toBe(0);
});
it.each([[1,0,false],[0,-1,false],[0,1,true],[0,2,true]] as const)('classifies shared-endpoint lines to (%s,%s)',(x,y,overlap)=>{
 const f=new AlgebraicContext(),point=(x:number,y:number)=>({x:f.number(x),y:f.number(y)}),shared=point(0,0);
 const a={kind:'line' as const,sourceId:'a',start:shared,end:point(0,1)},b={kind:'line' as const,sourceId:'b',start:shared,end:point(x,y)};
 for(const [first,second] of [[a,b],[b,a]] as const){const result=primitiveIntersections(f,first,second);expect(result.overlap).toBe(overlap);if(!overlap)expect(result.points).toEqual([shared]);}
});
