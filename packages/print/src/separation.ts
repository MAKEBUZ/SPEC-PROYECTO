import {AlgebraicContext,type Exact} from '../../geometry/src/algebraic.js';
import {primitiveIntersections,dot,vector,determinant,type ExactPoint,type DerivedLine} from '../../geometry/src/derived-path.js';
export interface ExactBox {minX:Exact;maxX:Exact;minY:Exact;maxY:Exact}
export function boxDistanceSquared(f:AlgebraicContext,a:ExactBox,b:ExactBox){
 const gap=(amin:Exact,amax:Exact,bmin:Exact,bmax:Exact)=>f.compare(amax,bmin)<0?f.sub(bmin,amax):f.compare(bmax,amin)<0?f.sub(amin,bmax):f.zero;
 return f.add(f.square(gap(a.minX,a.maxX,b.minX,b.maxX)),f.square(gap(a.minY,a.maxY,b.minY,b.maxY)));
}
export function boxSeparated(f:AlgebraicContext,a:ExactBox,b:ExactBox){return f.compare(boxDistanceSquared(f,a,b),f.number(4))>=0;}
function pointDistanceSquared(f:AlgebraicContext,p:ExactPoint,line:DerivedLine){
 const v=vector(f,line.end,line.start),w=vector(f,p,line.start),den=dot(f,v,v);
 if(f.sign(den)===0)return dot(f,w,w);
 const t=f.div(dot(f,v,w),den);
 if(f.sign(t)<=0)return dot(f,w,w);if(f.compare(t,f.one)>=0){const d=vector(f,p,line.end);return dot(f,d,d);}
 return f.div(f.square(determinant(f,v,w)),den);
}
export function polygonContainsPoint(f:AlgebraicContext,p:ExactPoint,path:readonly DerivedLine[]){
 let winding=0;for(const e of path){const a=f.compare(e.start.y,p.y),b=f.compare(e.end.y,p.y),cross=f.sign(determinant(f,vector(f,e.end,e.start),vector(f,p,e.start)));
  if(a<=0&&b>0&&cross>0)winding++;if(a>0&&b<=0&&cross<0)winding--;
 }return winding!==0;
}
export function lineDistanceSquared(f:AlgebraicContext,a:DerivedLine,b:DerivedLine){
 const av=vector(f,a.end,a.start),bv=vector(f,b.end,b.start);
 if(f.sign(dot(f,av,av))===0)return pointDistanceSquared(f,a.start,b);
 if(f.sign(dot(f,bv,bv))===0)return pointDistanceSquared(f,b.start,a);
 const hit=primitiveIntersections(f,a,b);if(hit.overlap||hit.points.length)return f.zero;
 return [pointDistanceSquared(f,a.start,b),pointDistanceSquared(f,a.end,b),pointDistanceSquared(f,b.start,a),pointDistanceSquared(f,b.end,a)].reduce((x,y)=>f.compare(x,y)<0?x:y);
}
/** Exact polygon boundary distance plus containment: disjoint edges alone do
 * not prove disjoint filled pieces. Equality at 2 mm is accepted. */
export function polygonSeparation(f:AlgebraicContext,a:readonly DerivedLine[],b:readonly DerivedLine[]):'overlap'|'too-close'|'valid'{
 let close=false;for(const x of a)for(const y of b){const hit=primitiveIntersections(f,x,y);if(hit.overlap||hit.points.length)return 'overlap';
  if(f.compare(lineDistanceSquared(f,x,y),f.number(4))<0)close=true;
 }
 if(polygonContainsPoint(f,a[0]!.start,b)||polygonContainsPoint(f,b[0]!.start,a))return 'overlap';return close?'too-close':'valid';
}
