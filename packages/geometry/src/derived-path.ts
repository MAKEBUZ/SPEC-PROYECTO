import { AlgebraicContext } from './algebraic.js';
import type { Exact } from './algebraic.js';
import type { Winding } from './joins.js';
export interface ExactPoint {x:Exact;y:Exact}
export interface DerivedLine {kind:'line';start:ExactPoint;end:ExactPoint;sourceId:string}
export interface DerivedArc {kind:'arc';start:ExactPoint;end:ExactPoint;center:ExactPoint;radius:Exact;winding:Winding;sourceId:string}
export type DerivedPrimitive=DerivedLine|DerivedArc;
export const vector=(f:AlgebraicContext,a:ExactPoint,b:ExactPoint):ExactPoint=>({x:f.sub(a.x,b.x),y:f.sub(a.y,b.y)});
export const dot=(f:AlgebraicContext,a:ExactPoint,b:ExactPoint)=>f.add(f.mul(a.x,b.x),f.mul(a.y,b.y));
export const determinant=(f:AlgebraicContext,a:ExactPoint,b:ExactPoint)=>f.sub(f.mul(a.x,b.y),f.mul(a.y,b.x));
export const equalPoint=(f:AlgebraicContext,a:ExactPoint,b:ExactPoint)=>f.compare(a.x,b.x)===0&&f.compare(a.y,b.y)===0;
export const advance=(f:AlgebraicContext,p:ExactPoint,v:ExactPoint,t:Exact):ExactPoint=>({x:f.add(p.x,f.mul(v.x,t)),y:f.add(p.y,f.mul(v.y,t))});
const unit=(f:AlgebraicContext,t:Exact)=>f.sign(t)>=0&&f.compare(t,f.one)<=0;
export function supportIntersection(f:AlgebraicContext,a:DerivedLine,b:DerivedLine):{point:ExactPoint;t:Exact;u:Exact}|null {
  const v=vector(f,a.end,a.start),w=vector(f,b.end,b.start),d=vector(f,b.start,a.start),det=determinant(f,v,w);
  if(f.sign(det)===0)return null;
  const t=f.div(determinant(f,d,w),det),u=f.div(determinant(f,d,v),det);
  return {point:advance(f,a.start,v,t),t,u};
}
/** Convex corner arcs have directed sweep strictly below pi. */
export function onArc(f:AlgebraicContext,arc:DerivedArc,p:ExactPoint,strict=false):boolean {
  const start=vector(f,arc.start,arc.center),end=vector(f,arc.end,arc.center),v=vector(f,p,arc.center);
  if(f.compare(dot(f,v,v),f.square(arc.radius))!==0)return false;
  const a=f.sign(determinant(f,start,v))*arc.winding,b=f.sign(determinant(f,v,end))*arc.winding;
  return strict?a>0&&b>0:a>=0&&b>=0;
}
interface Hits {overlap:boolean;points:ExactPoint[]}
function lineLine(f:AlgebraicContext,a:DerivedLine,b:DerivedLine):Hits {
  const hit=supportIntersection(f,a,b);if(hit)return {overlap:false,points:unit(f,hit.t)&&unit(f,hit.u)?[hit.point]:[]};
  const v=vector(f,a.end,a.start),delta=vector(f,b.start,a.start);
  if(f.sign(determinant(f,v,delta))!==0)return {overlap:false,points:[]};
  const denominator=dot(f,v,v);
  const at=(p:ExactPoint)=>f.div(dot(f,vector(f,p,a.start),v),denominator);
  const t=at(b.start),u=at(b.end),lo=f.compare(t,u)<0?t:u,hi=f.compare(t,u)<0?u:t;
  const left=f.sign(lo)>0?lo:f.zero,right=f.compare(hi,f.one)<0?hi:f.one,order=f.compare(left,right);
  return {overlap:order<0,points:order===0?[advance(f,a.start,v,left)]:[]};
}
function lineArc(f:AlgebraicContext,line:DerivedLine,arc:DerivedArc):Hits {
  const v=vector(f,line.end,line.start),d=vector(f,line.start,arc.center);
  const a=dot(f,v,v),b=f.mul(f.number(2),dot(f,d,v)),c=f.sub(dot(f,d,d),f.square(arc.radius));
  const disc=f.sub(f.square(b),f.mul(f.number(4),f.mul(a,c))),sign=f.sign(disc);
  if(sign<0)return {overlap:false,points:[]};
  const root=f.sqrt(disc),den=f.mul(f.number(2),a),negativeB=f.sub(f.zero,b);
  const parameters=[f.div(f.add(negativeB,root),den)];if(sign)parameters.push(f.div(f.sub(negativeB,root),den));
  return {overlap:false,points:parameters.filter(t=>unit(f,t)).map(t=>advance(f,line.start,v,t)).filter(p=>onArc(f,arc,p))};
}
function arcArc(f:AlgebraicContext,a:DerivedArc,b:DerivedArc):Hits {
  const delta=vector(f,b.center,a.center),d2=dot(f,delta,delta);
  if(f.sign(d2)===0){
    if(f.compare(a.radius,b.radius)!==0)return {overlap:false,points:[]};
    const points=[a.start,a.end,b.start,b.end].filter(p=>onArc(f,a,p)&&onArc(f,b,p));
    const same=(equalPoint(f,a.start,b.start)&&equalPoint(f,a.end,b.end))||(equalPoint(f,a.start,b.end)&&equalPoint(f,a.end,b.start));
    return {overlap:same||points.some(p=>onArc(f,a,p,true)||onArc(f,b,p,true)),points};
  }
  const t=f.div(f.add(f.sub(f.square(a.radius),f.square(b.radius)),d2),f.mul(f.number(2),d2));
  const foot=advance(f,a.center,delta,t),h2=f.sub(f.div(f.square(a.radius),d2),f.square(t));
  if(f.sign(h2)<0)return {overlap:false,points:[]};
  const h=f.sqrt(h2),normal={x:f.sub(f.zero,delta.y),y:delta.x},points=[advance(f,foot,normal,h)];
  if(f.sign(h)!==0)points.push(advance(f,foot,normal,f.sub(f.zero,h)));
  return {overlap:false,points:points.filter(p=>onArc(f,a,p)&&onArc(f,b,p))};
}
export function primitiveIntersections(f:AlgebraicContext,a:DerivedPrimitive,b:DerivedPrimitive):Hits {
  if(a.kind==='line')return b.kind==='line'?lineLine(f,a,b):lineArc(f,a,b);
  return b.kind==='line'?lineArc(f,b,a):arcArc(f,a,b);
}
export function validateDerivedPath(f:AlgebraicContext,path:DerivedPrimitive[]) {
  const defects=new Set<string>();
  if(!path.length)return {defects:['empty-margin'],widthWithinLimit:false,heightWithinLimit:false};
  for(let i=0;i<path.length;i++){
    const p=path[i]!,next=path[(i+1)%path.length]!;
    if(!equalPoint(f,p.end,next.start))defects.add('open-margin');
    if(equalPoint(f,p.start,p.end))defects.add('constant-margin-segment');
    if(p.kind==='arc'){
      if(f.sign(p.radius)<=0||!onArc(f,p,p.start)||!onArc(f,p,p.end))defects.add('invalid-arc');
      const sweep=f.sign(determinant(f,vector(f,p.start,p.center),vector(f,p.end,p.center)))*p.winding;
      if(sweep<=0)defects.add('invalid-arc-sweep');
    }
  }
  // Reject degenerate supports before any division by their length.
  if(defects.size)return {defects:[...defects],widthWithinLimit:false,heightWithinLimit:false};
    // Exact conservative boxes exclude only strictly disjoint pairs. Equality
    // still reaches the intersection solver, including tangencies/overlaps.
    const boxes=path.map(p=>p.kind==='arc'?{
      minX:f.sub(p.center.x,p.radius),maxX:f.add(p.center.x,p.radius),minY:f.sub(p.center.y,p.radius),maxY:f.add(p.center.y,p.radius)
    }:{
      minX:f.compare(p.start.x,p.end.x)<0?p.start.x:p.end.x,maxX:f.compare(p.start.x,p.end.x)>0?p.start.x:p.end.x,
      minY:f.compare(p.start.y,p.end.y)<0?p.start.y:p.end.y,maxY:f.compare(p.start.y,p.end.y)>0?p.start.y:p.end.y
    });
  for(let i=0;i<path.length;i++)for(let j=i+1;j<path.length;j++){
      const A=boxes[i]!,B=boxes[j]!;
      if(f.compare(A.maxX,B.minX)<0||f.compare(B.maxX,A.minX)<0||f.compare(A.maxY,B.minY)<0||f.compare(B.maxY,A.minY)<0)continue;
    const a=path[i]!,b=path[j]!,hits=primitiveIntersections(f,a,b);
    if(hits.overlap)defects.add('overlap');
    for(const p of hits.points){
      const ordinary=(j===i+1&&equalPoint(f,p,a.end)&&equalPoint(f,p,b.start))||(i===0&&j===path.length-1&&equalPoint(f,p,a.start)&&equalPoint(f,p,b.end));
      if(!ordinary)defects.add('self-contact-or-crossing');
    }
  }
  const extrema=path.flatMap(p=>{
    if(p.kind==='line')return [p.start,p.end];
    const r=p.radius,c=p.center;
    return [p.start,p.end,...[{x:f.add(c.x,r),y:c.y},{x:f.sub(c.x,r),y:c.y},{x:c.x,y:f.add(c.y,r)},{x:c.x,y:f.sub(c.y,r)}].filter(v=>onArc(f,p,v))];
  });
  let minX=extrema[0]!.x,maxX=minX,minY=extrema[0]!.y,maxY=minY;
  for(const p of extrema){if(f.compare(p.x,minX)<0)minX=p.x;if(f.compare(p.x,maxX)>0)maxX=p.x;if(f.compare(p.y,minY)<0)minY=p.y;if(f.compare(p.y,maxY)>0)maxY=p.y;}
  const width=f.sub(maxX,minX),height=f.sub(maxY,minY),widthWithinLimit=f.compare(width,f.number(5000))<=0,heightWithinLimit=f.compare(height,f.number(5000))<=0;
  if(f.sign(width)===0||f.sign(height)===0)defects.add('zero-area');
  if(!widthWithinLimit)defects.add('width-exceeded');if(!heightWithinLimit)defects.add('height-exceeded');
  // A finite, closed, simple regular line/arc Jordan curve has strictly positive
  // enclosed area. No approximate sum of circular integrals is used as a zero test.
  return {defects:[...defects],widthWithinLimit,heightWithinLimit,bounds:{minX,maxX,minY,maxY}};
}
