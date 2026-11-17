import type {AlgebraicContext,Exact} from '../../geometry/src/algebraic.js';
import {advance,vector,dot,onArc,equalPoint,primitiveIntersections,type ExactPoint,type DerivedPrimitive,type DerivedArc,type DerivedLine} from '../../geometry/src/derived-path.js';
import {lineDistanceSquared,boxSeparated} from './separation.js';
import {marginDimensions} from '../../geometry/src/bounds.js';
const distance=(f:AlgebraicContext,a:ExactPoint,b:ExactPoint)=>{const d=vector(f,a,b);return dot(f,d,d);};
const minimum=(f:AlgebraicContext,values:Exact[])=>values.reduce((a,b)=>f.compare(a,b)<0?a:b);
function pointLine(f:AlgebraicContext,p:ExactPoint,l:DerivedLine){
 const v=vector(f,l.end,l.start),t=f.div(dot(f,vector(f,p,l.start),v),dot(f,v,v));
 return distance(f,p,advance(f,l.start,v,f.sign(t)<0?f.zero:f.compare(t,f.one)>0?f.one:t));
}
function pointArc(f:AlgebraicContext,p:ExactPoint,a:DerivedArc){
 const candidates=[a.start,a.end],v=vector(f,p,a.center),d2=dot(f,v,v);
 if(f.sign(d2)>0){const t=f.div(a.radius,f.sqrt(d2));for(const sign of [1,-1]){const q=advance(f,a.center,v,f.mul(t,f.number(sign)));if(onArc(f,a,q))candidates.push(q);}}
 return minimum(f,candidates.map(q=>distance(f,p,q)));
}
function lineArc(f:AlgebraicContext,l:DerivedLine,a:DerivedArc){
 const values=[pointArc(f,l.start,a),pointArc(f,l.end,a),pointLine(f,a.start,l),pointLine(f,a.end,l)];
 const v=vector(f,l.end,l.start),normal={x:f.sub(f.zero,v.y),y:v.x},t=f.div(dot(f,vector(f,a.center,l.start),v),dot(f,v,v));
 if(f.sign(t)>=0&&f.compare(t,f.one)<=0){const foot=advance(f,l.start,v,t),scale=f.div(a.radius,f.sqrt(dot(f,v,v)));
  for(const sign of [1,-1]){const q=advance(f,a.center,normal,f.mul(scale,f.number(sign)));if(onArc(f,a,q))values.push(distance(f,foot,q));}
 }return minimum(f,values);
}
function arcArc(f:AlgebraicContext,a:DerivedArc,b:DerivedArc){
 const values=[pointArc(f,a.start,b),pointArc(f,a.end,b),pointArc(f,b.start,a),pointArc(f,b.end,a)],v=vector(f,b.center,a.center),d2=dot(f,v,v);
 if(f.sign(d2)>0){const d=f.sqrt(d2);for(const sa of [1,-1])for(const sb of [1,-1]){
  const p=advance(f,a.center,v,f.div(f.mul(a.radius,f.number(sa)),d)),q=advance(f,b.center,v,f.div(f.mul(b.radius,f.number(sb)),d));
  if(onArc(f,a,p)&&onArc(f,b,q))values.push(distance(f,p,q));
 }}return minimum(f,values);
}
/** Distance between open primitives; deliberately no filled-path containment. */
export function primitiveDistanceSquared(f:AlgebraicContext,a:DerivedPrimitive,b:DerivedPrimitive){
 const hits=primitiveIntersections(f,a,b);if(hits.overlap||hits.points.length)return f.zero;
 return a.kind==='line'?(b.kind==='line'?lineDistanceSquared(f,a,b):lineArc(f,a,b)):(b.kind==='line'?lineArc(f,b,a):arcArc(f,a,b));
}
/** Half-open horizontal ray crossings; tangencies at circle extrema contribute
 * zero. Endpoint inclusion follows the same upward/downward rule as lines. */
function inside(f:AlgebraicContext,p:ExactPoint,path:readonly DerivedPrimitive[]){
 let winding=0;
 for(const e of path){
  if(e.kind==='line'){
   const a=f.compare(e.start.y,p.y),b=f.compare(e.end.y,p.y);if(!((a<=0&&b>0)||(a>0&&b<=0)))continue;
   const t=f.div(f.sub(p.y,e.start.y),f.sub(e.end.y,e.start.y)),x=advance(f,e.start,vector(f,e.end,e.start),t).x;
   if(f.compare(x,p.x)>0)winding+=b>a?1:-1;
  }else{
   const dy=f.sub(p.y,e.center.y),dx2=f.sub(f.square(e.radius),f.square(dy));if(f.sign(dx2)<=0)continue;const dx=f.sqrt(dx2);
   for(const sign of [1,-1]){const q={x:f.add(e.center.x,f.mul(dx,f.number(sign))),y:p.y};if(f.compare(q.x,p.x)<=0||!onArc(f,e,q))continue;
    const direction=sign*e.winding;if(direction>0&&equalPoint(f,q,e.end)||direction<0&&equalPoint(f,q,e.start))continue;winding+=direction;
   }
  }
 }return winding!==0;
}
export function pathSeparation(f:AlgebraicContext,a:readonly DerivedPrimitive[],b:readonly DerivedPrimitive[]):'overlap'|'too-close'|'valid'{
 let close=false;
 const boxes=new Map([...a,...b].map(p=>[p,marginDimensions(f,[p]).bounds]));
 for(const x of a)for(const y of b){const xb=boxes.get(x)!,yb=boxes.get(y)!;if(boxSeparated(f,xb,yb))continue;
  const disjoint=f.compare(xb.maxX,yb.minX)<0||f.compare(yb.maxX,xb.minX)<0||f.compare(xb.maxY,yb.minY)<0||f.compare(yb.maxY,xb.minY)<0;
  if(!disjoint){const hits=primitiveIntersections(f,x,y);if(hits.overlap||hits.points.length)return 'overlap';}
  const d=x.kind==='line'?(y.kind==='line'?lineDistanceSquared(f,x,y):lineArc(f,x,y)):(y.kind==='line'?lineArc(f,y,x):arcArc(f,x,y));if(f.compare(d,f.number(4))<0)close=true;
 }
 if(inside(f,a[0]!.start,b)||inside(f,b[0]!.start,a))return 'overlap';return close?'too-close':'valid';
}
