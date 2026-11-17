import { rational as q, fromNumber, compare } from './numeric.js';
import type { Rational } from './numeric.js';
import { derivative, evaluate, gcd, isolateRoots, rationals as Q } from './polynomials.js';
import type { Root } from './polynomials.js';
import { curvePolynomials, inspectContour } from './intersections.js';
import { analyzeContour, segmentControls } from './contour-validation.js';
import { assertContour } from './model.js';
import type { Coordinate, Contour, CornerJoin } from './model.js';
import { constructJoin, normSquared, squareRootField, OffsetCalculationError } from './joins.js';
import type { Join, ExactVector, Winding } from './joins.js';
import { AlgebraicContext } from './algebraic.js';
import { advance, vector, dot, equalPoint, supportIntersection, validateDerivedPath } from './derived-path.js';
import type { DerivedLine, DerivedPrimitive, ExactPoint } from './derived-path.js';
import type { Exact } from './algebraic.js';
import { trimOffsetLineCorner, trimOffsetCurveCorner, CoincidentOffsetError } from './offset-intersections.js';
import { certifyCurvedMargin } from './curved-margin.js';
import type { CertifiedCurvedMargin } from './curved-margin.js';
import { dimensionsOfPoints } from './bounds.js';

export interface OffsetSpan {
  kind:'line-offset'|'bezier-offset';
  segmentId:string;
  controls:Coordinate[];
  width:number;
  winding:Winding;
  stationaryParameters:Root[];
}
export interface OffsetSource {contour:Contour;seamWidth:number|null;cornerJoins:Record<string,CornerJoin>}
export type OffsetConstruction =
  | {kind:'absent'}
  | {kind:'invalid-base';width:number;defects:string[]}
  | {kind:'coincident';width:0;contour:Contour;validation:'pending'}
  | {kind:'candidate';width:number;spans:OffsetSpan[];joins:Join[];validation:'pending'};

function checkWidth(width:number,winding:Winding):void {
  if(!Number.isFinite(width)||width<0)throw new OffsetCalculationError('INVALID_WIDTH');
  if(winding!==1&&winding!==-1)throw new OffsetCalculationError('INVALID_WINDING');
}
/** Tangent of the traversal, using its one-sided limit at a stationary end.
 * At the final endpoint the derivative's first nonzero term has (-1)^order. */
export function endpointTangent(controls:readonly Coordinate[],end:0|1):ExactVector {
  const p=curvePolynomials(controls);let dx=derivative(p.x,Q),dy=derivative(p.y,Q),order=0;
  while(dx.length||dy.length){
    const x=evaluate(dx,q(BigInt(end)),Q),y=evaluate(dy,q(BigInt(end)),Q);
    if(compare(x,Q.zero)!==0||compare(y,Q.zero)!==0){
      const sign=end===1&&order%2?-1n:1n;
      return {x:Q.mul(q(sign),x),y:Q.mul(q(sign),y)};
    }
    dx=derivative(dx,Q);dy=derivative(dy,Q);order++;
  }
  throw new OffsetCalculationError('CONSTANT_SEGMENT');
}
/** Evaluate O(t)=B(t)+d*N(t) exactly at a rational parameter. The returned
 * algebraic point is derived, never serialized into the editable document. */
export function evaluateOffset(controls:readonly Coordinate[],width:number,winding:Winding,t:Rational) {
  checkWidth(width,winding);
  if(compare(t,Q.zero)<0||compare(t,Q.one)>0)throw new OffsetCalculationError('PARAMETER_OUT_OF_RANGE');
  const p=curvePolynomials(controls),dx=derivative(p.x,Q),dy=derivative(p.y,Q);
  if(width===0){
    const field=squareRootField(Q.one);
    return {field,x:field.fromRational(evaluate(p.x,t,Q)),y:field.fromRational(evaluate(p.y,t,Q))};
  }
  let tangent={x:evaluate(dx,t,Q),y:evaluate(dy,t,Q)};
  if(compare(normSquared(tangent),Q.zero)===0){
    if(compare(t,Q.zero)===0)tangent=endpointTangent(controls,0);
    else if(compare(t,Q.one)===0)tangent=endpointTangent(controls,1);
    else {
      let x=dx,y=dy,order=0;
      while(compare(normSquared(tangent),Q.zero)===0&&(x.length||y.length)){
        x=derivative(x,Q);y=derivative(y,Q);order++;
        tangent={x:evaluate(x,t,Q),y:evaluate(y,t,Q)};
      }
      if(order%2||compare(normSquared(tangent),Q.zero)===0)throw new OffsetCalculationError('STATIONARY_PARAMETER_REQUIRES_ONE_SIDED_LIMIT');
    }
  }
  const field=squareRootField(normSquared(tangent)),speed=field.generator;
  const d=field.fromRational(Q.mul(fromNumber(width),q(BigInt(winding))));
  const x=field.add(field.fromRational(evaluate(p.x,t,Q)),field.div(field.mul(d,field.fromRational(tangent.y)),speed));
  const y=field.sub(field.fromRational(evaluate(p.y,t,Q)),field.div(field.mul(d,field.fromRational(tangent.x)),speed));
  return {field,x,y};
}
/** Conceptual construction only. Certification of trimmed offsets and their
 * full topology/dimensions is deliberately not implied by a candidate. */
export function buildOffset(piece:OffsetSource):OffsetConstruction {
  assertContour(piece.contour);
  if(piece.seamWidth!==null)checkWidth(piece.seamWidth,1);
  if(!piece.cornerJoins||typeof piece.cornerJoins!=='object'||Array.isArray(piece.cornerJoins))throw new OffsetCalculationError('INVALID_JOIN_SETTINGS');
  const ids=new Set(piece.contour.points.map(p=>p.id));
  for(const [id,style] of Object.entries(piece.cornerJoins))if(!ids.has(id)||(style!=='round'&&style!=='miter'))throw new OffsetCalculationError('INVALID_JOIN_SETTINGS');
  if(piece.seamWidth===null)return {kind:'absent'};
  const width=piece.seamWidth,inspection=inspectContour(piece.contour);
  if(inspection.defects.length)return {kind:'invalid-base',width,defects:inspection.defects};
  if(width===0)return {kind:'coincident',width:0,contour:structuredClone(piece.contour),validation:'pending'};
  const area=analyzeContour(piece.contour).signedArea;
  if(!area||compare(area,Q.zero)===0)throw new OffsetCalculationError('ORIENTATION_UNAVAILABLE');
  const winding=compare(area,Q.zero) as Winding;
  const spans:OffsetSpan[]=piece.contour.segments.map(segment=>{
    const controls=segmentControls(piece.contour,segment.id),p=curvePolynomials(controls);
    const stationary=gcd(derivative(p.x,Q),derivative(p.y,Q),Q);
    return {kind:segment.kind==='line'?'line-offset':'bezier-offset',segmentId:segment.id,controls,width,winding,stationaryParameters:isolateRoots(stationary,Q.zero,Q.one,Q)};
  });
  const points=new Map(piece.contour.points.map(point=>[point.id,point]));
  const joins=spans.map((span,i)=>{
    const next=spans[(i+1)%spans.length]!,vertexId=piece.contour.segments[i]!.endId,point=points.get(vertexId)!;
    return constructJoin({vertexId,vertex:{x:point.x,y:point.y},incoming:endpointTangent(span.controls,1),outgoing:endpointTangent(next.controls,0),width,winding,style:piece.cornerJoins[vertexId]??'miter'});
  });
  return {kind:'candidate',width,spans,joins,validation:'pending'};
}

export type MarginValidation=
  | CertifiedCurvedMargin
  | {kind:'absent'}
  | {kind:'invalid-base';width:number;defects:string[]}
  | {kind:'invalid-margin';width:number;defects:string[];dimensions?:ReturnType<typeof dimensionsOfPoints>}
  | {kind:'validated-coincident';width:0;validation:'valid';contour:Contour;widthWithinLimit:true;heightWithinLimit:true}
  | {kind:'validated';width:number;validation:'valid';field:AlgebraicContext;path:DerivedPrimitive[];trims:{vertexId:string;point:ExactPoint}[];widthWithinLimit:true;heightWithinLimit:true};

function straightControls(c:readonly Coordinate[]):boolean {
  const a=c[0]!,b=c.at(-1)!,dx=Q.sub(fromNumber(b.x),fromNumber(a.x)),dy=Q.sub(fromNumber(b.y),fromNumber(a.y));
  if(Q.sign(dx)===0&&Q.sign(dy)===0)return c.every(p=>p.x===a.x&&p.y===a.y);
  return c.every(p=>Q.sign(Q.sub(Q.mul(Q.sub(fromNumber(p.x),fromNumber(a.x)),dy),Q.mul(Q.sub(fromNumber(p.y),fromNumber(a.y)),dx)))===0);
}
function shiftedLine(f:AlgebraicContext,c:readonly Coordinate[],width:number,winding:Winding,sourceId:string):DerivedLine {
  const a={x:f.number(c[0]!.x),y:f.number(c[0]!.y)},b={x:f.number(c.at(-1)!.x),y:f.number(c.at(-1)!.y)},v=vector(f,b,a);
  const speed=f.sqrt(dot(f,v,v)),d=f.number(width*winding),shift={x:f.div(f.mul(d,v.y),speed),y:f.div(f.mul(f.sub(f.zero,d),v.x),speed)};
  return {kind:'line',sourceId,start:advance(f,a,shift,f.one),end:advance(f,b,shift,f.one)};
}
export interface LocalTrim {vertexId:string;incomingId:string;outgoingId:string;point:ExactPoint;incomingParameter:Exact;outgoingParameter:Exact}
/** Resolve adjacent concave encounters on their actual trajectories. The
 * result is local construction, not a global validity certificate. */
export function resolveConcaveOffsets(piece:OffsetSource) {
  const construction=buildOffset(piece),field=new AlgebraicContext(),trims:LocalTrim[]=[];
  if(construction.kind!=='candidate')return {construction,field,trims,defects:construction.kind==='invalid-base'?construction.defects:[] as string[]};
  for(let i=0;i<construction.spans.length;i++){
    const join=construction.joins[i]!;if(join.kind!=='concave')continue;
    const a=construction.spans[i]!,b=construction.spans[(i+1)%construction.spans.length]!,al=straightControls(a.controls),bl=straightControls(b.controls);
    let point:ExactPoint,incomingParameter:Exact,outgoingParameter:Exact;
    if(al&&bl){
      const hit=supportIntersection(field,shiftedLine(field,a.controls,a.width,a.winding,a.segmentId),shiftedLine(field,b.controls,b.width,b.winding,b.segmentId));
      if(!hit)return {construction,field,trims,defects:['missing-local-intersection']};
      ({point,t:incomingParameter,u:outgoingParameter}=hit);
    }else if(al||bl){
      const curved=al?b:a,linear=al?a:b,line=shiftedLine(field,linear.controls,linear.width,linear.winding,linear.segmentId);
      const hit=trimOffsetLineCorner(field,curved,line,!al);
      if(!hit)return {construction,field,trims,defects:['missing-local-intersection']};
      point=hit.point;incomingParameter=al?hit.otherParameter!:hit.curveParameter;outgoingParameter=al?hit.curveParameter:hit.otherParameter!;
    }else {
      let hit;
      try{hit=trimOffsetCurveCorner(field,a,b);}catch(error){if(error instanceof CoincidentOffsetError)return {construction,field,trims,defects:['overlap']};throw error;}
      if(!hit)return {construction,field,trims,defects:['missing-local-intersection']};
      ({point,incomingParameter,outgoingParameter}=hit);
    }
    if([incomingParameter,outgoingParameter].some(t=>field.sign(t)<0||field.compare(t,field.one)>0))return {construction,field,trims,defects:['local-trim-outside-adjacent-spans']};
    trims.push({vertexId:join.vertexId,incomingId:a.segmentId,outgoingId:b.segmentId,point,incomingParameter,outgoingParameter});
  }
  for(const span of construction.spans){
    const start=trims.find(t=>t.outgoingId===span.segmentId)?.outgoingParameter??field.zero;
    const end=trims.find(t=>t.incomingId===span.segmentId)?.incomingParameter??field.one;
    if(field.compare(start,end)>=0)return {construction,field,trims,defects:['consumed-or-reversed-span']};
  }
  return {construction,field,trims,defects:[] as string[]};
}

/** Exact construction and certification for straight supports, including arcs
 * at convex corners. A curved support must use the curved certifier; it must
 * never fall back to its chord or a sampled polyline. */
export function validateOffset(piece:OffsetSource):MarginValidation {
  const construction=buildOffset(piece);
  if(construction.kind==='absent'||construction.kind==='invalid-base')return construction;
  const width=construction.width,f=new AlgebraicContext(),trims:{vertexId:string;point:ExactPoint}[]=[];
  const controls=piece.contour.segments.map(s=>segmentControls(piece.contour,s.id));
  const straight=controls.every(straightControls);
  if(!straight&&width===0){
    const extrema=controls.flatMap(c=>{
      const p=curvePolynomials(c),parameters=[f.zero,f.one];
      for(const axis of ['x','y'] as const){const d=derivative(p[axis],Q);if(d.length)parameters.push(...f.roots(d.map(v=>f.fromRational(v))));}
      return parameters.map(t=>({x:evaluate(p.x.map(v=>f.fromRational(v)),t,f),y:evaluate(p.y.map(v=>f.fromRational(v)),t,f)}));
    });
    const defects:string[]=[];
    for(const axis of ['x','y'] as const){
      let min=extrema[0]![axis],max=min;
      for(const point of extrema){if(f.compare(point[axis],min)<0)min=point[axis];if(f.compare(point[axis],max)>0)max=point[axis];}
      if(f.compare(f.sub(max,min),f.number(5000))>0)defects.push(axis==='x'?'width-exceeded':'height-exceeded');
    }
    return defects.length?{kind:'invalid-margin',width,defects,dimensions:dimensionsOfPoints(f,extrema)}:{kind:'validated-coincident',width:0,validation:'valid',contour:structuredClone(piece.contour),widthWithinLimit:true,heightWithinLimit:true};
  }
  if(!straight){
    if(construction.kind!=='candidate')throw new OffsetCalculationError('UNEXPECTED_OFFSET_STATE');
    return certifyCurvedMargin(construction);
  }
  const winding=Q.sign(analyzeContour(piece.contour).signedArea!) as Winding;
  const line=(i:number):DerivedLine=>shiftedLine(f,controls[i]!,width,winding,piece.contour.segments[i]!.id);
  const originals=controls.map((_,i)=>line(i)),lines=originals.map(p=>({...p}));
  const arcs=new Map<number,DerivedPrimitive>();
  if(construction.kind==='candidate')for(let i=0;i<lines.length;i++){
    const next=(i+1)%lines.length,join=construction.joins[i]!,incoming=originals[i]!,outgoing=originals[next]!;
    if(join.kind==='smooth'){
      if(!equalPoint(f,incoming.end,outgoing.start))return {kind:'invalid-margin',width,defects:['disconnected-smooth-join']};
    }else if(join.kind==='reversal')return {kind:'invalid-margin',width,defects:['reversing-join']};
    else if(join.kind==='round'){
      arcs.set(i,{kind:'arc',sourceId:join.vertexId,start:incoming.end,end:outgoing.start,center:{x:f.number(join.vertex.x),y:f.number(join.vertex.y)},radius:f.number(width),winding});
    }else{
      const hit=supportIntersection(f,incoming,outgoing);
      if(!hit)return {kind:'invalid-margin',width,defects:['missing-local-intersection']};
      if(join.kind==='concave'){
        if(f.sign(hit.t)<0||f.compare(hit.t,f.one)>0||f.sign(hit.u)<0||f.compare(hit.u,f.one)>0)return {kind:'invalid-margin',width,defects:['local-trim-outside-adjacent-spans']};
        trims.push({vertexId:join.vertexId,point:hit.point});
      }
      lines[i]!.end=hit.point;lines[next]!.start=hit.point;
    }
  }
  const path:DerivedPrimitive[]=[];
  for(let i=0;i<lines.length;i++){
    const original=originals[i]!,current=lines[i]!;
    if(f.sign(dot(f,vector(f,current.end,current.start),vector(f,original.end,original.start)))<=0)return {kind:'invalid-margin',width,defects:['consumed-or-reversed-span']};
    path.push(current);const arc=arcs.get(i);if(arc)path.push(arc);
  }
  const validation=validateDerivedPath(f,path);
  if(validation.defects.length){
    const b=validation.bounds;
    return {kind:'invalid-margin',width,defects:validation.defects,...b?{dimensions:dimensionsOfPoints(f,[{x:b.minX,y:b.minY},{x:b.maxX,y:b.maxY}])}:{}};
  }
  return {kind:'validated',width,validation:'valid',field:f,path,trims,widthWithinLimit:true,heightWithinLimit:true};
}
