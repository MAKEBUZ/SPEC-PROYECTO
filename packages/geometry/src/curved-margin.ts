import { AlgebraicContext } from './algebraic.js';
import type { Exact } from './algebraic.js';
import { OffsetCalculationError } from './joins.js';
import type { OffsetSpan, OffsetConstruction } from './offset.js';
import { endpointTangent } from './offset.js';
import { evaluateDerivedOffset, intersectOffsetLine, intersectOffsetArc, intersectOffsetCurves, trimOffsetCurveCorner, selectOffsetLineTrim, offsetCriticalParameters, splitStationaryOffset, proveOffsetInjective, certifyOffsetSelfCrossing, CoincidentOffsetError } from './offset-intersections.js';
import type { CurveHit } from './offset-intersections.js';
import type { OffsetCurve } from './offset-intersections.js';
import { advance, vector, dot, equalPoint, supportIntersection, primitiveIntersections, onArc } from './derived-path.js';
import type { DerivedPrimitive, DerivedLine, ExactPoint } from './derived-path.js';
import { orientation } from './numeric.js';
import { dimensionsOfPoints } from './bounds.js';

export interface DerivedOffset {kind:'offset';sourceId:string;curve:OffsetCurve;start:ExactPoint;end:ExactPoint;from:Exact;to:Exact}
export type MarginPrimitive=DerivedPrimitive|DerivedOffset;
export interface CertifiedCurvedMargin {kind:'validated';width:number;validation:'valid';field:AlgebraicContext;path:MarginPrimitive[];trims:{vertexId:string;point:ExactPoint}[];widthWithinLimit:true;heightWithinLimit:true}
type Candidate=Extract<OffsetConstruction,{kind:'candidate'}>;
const contains=(f:AlgebraicContext,p:DerivedOffset,t:Exact)=>f.compare(t,p.from)>=0&&f.compare(t,p.to)<=0;
const containsPoint=(f:AlgebraicContext,p:DerivedOffset,t:Exact,point:ExactPoint)=>contains(f,p,t)&&
  (f.compare(t,p.from)!==0||equalPoint(f,point,p.start))&&(f.compare(t,p.to)!==0||equalPoint(f,point,p.end));
function straight(span:OffsetSpan):boolean {
  const a=span.controls[0]!,b=span.controls.at(-1)!;
  return (a.x!==b.x||a.y!==b.y)&&span.controls.every(p=>orientation(a,b,p)===0);
}
export function certifyCurvedMargin(candidate:Candidate):CertifiedCurvedMargin|InvalidCurvedMargin {
  try{return certify(candidate);}catch(error){if(error instanceof CoincidentOffsetError)return {kind:'invalid-margin',width:candidate.width,defects:['overlap']};throw error;}
}
interface InvalidCurvedMargin {kind:'invalid-margin';width:number;defects:string[];dimensions?:ReturnType<typeof dimensionsOfPoints>}
function certify(candidate:Candidate):CertifiedCurvedMargin|InvalidCurvedMargin {
  const f=new AlgebraicContext(),width=candidate.width,trims:{vertexId:string;point:ExactPoint}[]=[];
  const invalid=(...defects:string[])=>({kind:'invalid-margin' as const,width,defects});
  const spans:(DerivedLine|DerivedOffset)[]=candidate.spans.map(span=>{
    const start=evaluateDerivedOffset(f,span,f.zero),end=evaluateDerivedOffset(f,span,f.one);
    return straight(span)?{kind:'line',sourceId:span.segmentId,start,end}:{kind:'offset',sourceId:span.segmentId,curve:span,start,end,from:f.zero,to:f.one};
  });
  const original=spans.map(s=>({...s})),connections=new Map<number,DerivedPrimitive[]>();
  const trimIntersections=new Map<string,CurveHit[]>(),pairKey=(a:string,b:string)=>JSON.stringify([a,b]);
  for(let i=0;i<spans.length;i++){
    const next=(i+1)%spans.length,a=spans[i]!,b=spans[next]!,join=candidate.joins[i]!;
    const P=original[i]!.end,Q=original[next]!.start;
    if(join.kind==='smooth'){
      if(!equalPoint(f,P,Q))return invalid('disconnected-smooth-join');
    }else if(join.kind==='reversal')return invalid('reversing-join');
    else if(join.kind==='round')connections.set(i,[{kind:'arc',sourceId:join.vertexId,start:P,end:Q,center:{x:f.number(join.vertex.x),y:f.number(join.vertex.y)},radius:f.number(width),winding:join.winding}]);
    else if(join.kind==='miter'){
      const tangent=(span:OffsetSpan,end:0|1)=>{const t=endpointTangent(span.controls,end);return {x:f.fromRational(t.x),y:f.fromRational(t.y)};};
      const first:DerivedLine={kind:'line',sourceId:join.vertexId,start:P,end:advance(f,P,tangent(candidate.spans[i]!,1),f.one)};
      const second:DerivedLine={kind:'line',sourceId:join.vertexId,start:Q,end:advance(f,Q,tangent(candidate.spans[next]!,0),f.one)};
      const hit=supportIntersection(f,first,second);if(!hit)return invalid('missing-miter-intersection');
      connections.set(i,[{kind:'line',sourceId:join.vertexId,start:P,end:hit.point},{kind:'line',sourceId:join.vertexId,start:hit.point,end:Q}].filter(s=>!equalPoint(f,s.start,s.end)) as DerivedLine[]);
    }else{
      let point:ExactPoint,t:Exact,u:Exact;
      if(a.kind==='line'&&b.kind==='line'){
        const hit=supportIntersection(f,original[i] as DerivedLine,original[next] as DerivedLine);if(!hit)return invalid('missing-local-intersection');({point,t,u}=hit);
      }else if(a.kind==='offset'&&b.kind==='offset'){
        const hit=trimOffsetCurveCorner(f,a.curve,b.curve);if(!hit)return invalid('missing-local-intersection');({point,incomingParameter:t,outgoingParameter:u}=hit);
      }else{
        const incoming=a.kind==='offset',curve=(incoming?a:b) as DerivedOffset,line=(incoming?original[next]:original[i]) as DerivedLine;
        const hits=intersectOffsetLine(f,curve.curve,line);
        trimIntersections.set(pairKey(curve.sourceId,line.sourceId),hits);
        const hit=selectOffsetLineTrim(f,curve.curve,hits,incoming);if(!hit)return invalid('missing-local-intersection');
        point=hit.point;t=incoming?hit.curveParameter:hit.otherParameter!;u=incoming?hit.otherParameter!:hit.curveParameter;
      }
      if([t,u].some(v=>f.sign(v)<0||f.compare(v,f.one)>0))return invalid('local-trim-outside-adjacent-spans');
      a.end=point;b.start=point;if(a.kind==='offset')a.to=t;if(b.kind==='offset')b.from=u;trims.push({vertexId:join.vertexId,point});
    }
  }
  const path:MarginPrimitive[]=[];
  for(let i=0;i<spans.length;i++){
    const span=spans[i]!;
    if(span.kind==='line'){
      const old=original[i]!;if(f.sign(dot(f,vector(f,span.end,span.start),vector(f,old.end,old.start)))<=0)return invalid('consumed-or-reversed-span');
    }else{
      if(f.compare(span.from,span.to)>=0)return invalid('consumed-or-reversed-span');
      if(certifyOffsetSelfCrossing(span.curve,f.enclosingInterval(span.from).hi,f.enclosingInterval(span.to).lo))return invalid('self-contact-or-crossing');
      const split=splitStationaryOffset(f,span.curve);
      if(split.breaks.some(b=>f.compare(b.parameter,span.from)>0&&f.compare(b.parameter,span.to)<0&&!b.continuous))return invalid('discontinuous-stationary-offset');
      const self=proveOffsetInjective(span.curve)?[]:intersectOffsetCurves(f,span.curve,span.curve,true);
      for(const hit of self)if(containsPoint(f,span,hit.incomingParameter,hit.point)&&containsPoint(f,span,hit.outgoingParameter,hit.point)){
        const ordinary=f.compare(hit.incomingParameter,span.from)===0&&f.compare(hit.outgoingParameter,span.to)===0&&equalPoint(f,span.start,span.end);
        if(!ordinary)return invalid('self-contact-or-crossing');
      }
    }
    path.push(span,...connections.get(i)??[]);
  }
  for(let i=0;i<path.length;i++)if(!equalPoint(f,path[i]!.end,path[(i+1)%path.length]!.start))return invalid('open-margin');
  const ordinary=(i:number,j:number,p:ExactPoint)=>
    (j===i+1&&equalPoint(f,p,path[i]!.end)&&equalPoint(f,p,path[j]!.start))||
    (i===0&&j===path.length-1&&equalPoint(f,p,path[i]!.start)&&equalPoint(f,p,path[j]!.end));
  const boxes=path.map(p=>{
    if(p.kind==='offset'){
      const xs=p.curve.controls.map(v=>v.x),ys=p.curve.controls.map(v=>v.y),d=f.number(p.curve.width);
      return {minX:f.sub(f.number(Math.min(...xs)),d),maxX:f.add(f.number(Math.max(...xs)),d),minY:f.sub(f.number(Math.min(...ys)),d),maxY:f.add(f.number(Math.max(...ys)),d)};
    }
    if(p.kind==='arc')return {minX:f.sub(p.center.x,p.radius),maxX:f.add(p.center.x,p.radius),minY:f.sub(p.center.y,p.radius),maxY:f.add(p.center.y,p.radius)};
    return {minX:f.compare(p.start.x,p.end.x)<0?p.start.x:p.end.x,maxX:f.compare(p.start.x,p.end.x)>0?p.start.x:p.end.x,minY:f.compare(p.start.y,p.end.y)<0?p.start.y:p.end.y,maxY:f.compare(p.start.y,p.end.y)>0?p.start.y:p.end.y};
  });
  for(let i=0;i<path.length;i++)for(let j=i+1;j<path.length;j++){
    const A=boxes[i]!,B=boxes[j]!;
    if(f.compare(A.maxX,B.minX)<0||f.compare(B.maxX,A.minX)<0||f.compare(A.maxY,B.minY)<0||f.compare(B.maxY,A.minY)<0)continue;
    const a=path[i]!,b=path[j]!;let points:ExactPoint[];
    if(a.kind!=='offset'&&b.kind!=='offset'){
      const hits=primitiveIntersections(f,a,b);if(hits.overlap)return invalid('overlap');points=hits.points;
    }else if(a.kind==='offset'&&b.kind==='offset'){
      points=intersectOffsetCurves(f,a.curve,b.curve).filter(h=>containsPoint(f,a,h.incomingParameter,h.point)&&containsPoint(f,b,h.outgoingParameter,h.point)).map(h=>h.point);
    }else{
      const curve=(a.kind==='offset'?a:b) as DerivedOffset,other=(a.kind==='offset'?b:a) as DerivedPrimitive;
      const cached=other.kind==='line'?trimIntersections.get(pairKey(curve.sourceId,other.sourceId)):undefined;
      // Trimming only shortens this original line along its support. Retain
      // every original intersection still on the finite line, not just the
      // chosen join: a second crossing must still invalidate the margin.
      const hits=cached&&other.kind==='line'?cached.filter(h=>{
        const d=vector(f,other.end,other.start),projection=dot(f,vector(f,h.point,other.start),d);
        return f.sign(projection)>=0&&f.compare(projection,dot(f,d,d))<=0;
      }):other.kind==='line'?intersectOffsetLine(f,curve.curve,other):intersectOffsetArc(f,curve.curve,other);
      points=hits.filter(h=>containsPoint(f,curve,h.curveParameter,h.point)).map(h=>h.point);
    }
    if(points.some(p=>!ordinary(i,j,p)))return invalid('self-contact-or-crossing');
  }
  const points:ExactPoint[]=path.flatMap(p=>{
    if(p.kind==='line')return [p.start,p.end];
    if(p.kind==='offset')return [p.start,p.end,...offsetCriticalParameters(f,p.curve).filter(t=>f.compare(t,p.from)>0&&f.compare(t,p.to)<0).map(t=>evaluateDerivedOffset(f,p.curve,t))];
    const c=p.center,r=p.radius;
    return [p.start,p.end,...[{x:f.add(c.x,r),y:c.y},{x:f.sub(c.x,r),y:c.y},{x:c.x,y:f.add(c.y,r)},{x:c.x,y:f.sub(c.y,r)}].filter(v=>onArc(f,p,v))];
  });
  if(!points.length)throw new OffsetCalculationError('EMPTY_DERIVED_MARGIN');
  const defects:string[]=[];
  for(const axis of ['x','y'] as const){
    let min=points[0]![axis],max=min;for(const p of points){if(f.compare(p[axis],min)<0)min=p[axis];if(f.compare(p[axis],max)>0)max=p[axis];}
    const extent=f.sub(max,min);if(f.sign(extent)===0)defects.push('zero-area');if(f.compare(extent,f.number(5000))>0)defects.push(axis==='x'?'width-exceeded':'height-exceeded');
  }
  // Closed simple nonconstant continuous curves enclose positive area; no
  // sampled polygon or approximate cancellation of integrals decides zero.
  return defects.length?{...invalid(...defects),dimensions:dimensionsOfPoints(f,points)}:{kind:'validated',width,validation:'valid',field:f,path,trims,widthWithinLimit:true,heightWithinLimit:true};
}
