import type { Coordinate } from './model.js';
import { curvePolynomials, affine } from './intersections.js';
import { derivative, evaluate, polynomialAdd, polynomialSubtract, polynomialMultiply, scale, gcd, exactDivide, rationals as Q, isolateRoots, RootField, countRoots } from './polynomials.js';
import { rational as q, fromNumber } from './numeric.js';
import type { Rational } from './numeric.js';
import { AlgebraicContext } from './algebraic.js';
import type { Exact } from './algebraic.js';
import { OffsetCalculationError } from './joins.js';
import type { Winding } from './joins.js';
import { vector, dot, onArc } from './derived-path.js';
import type { DerivedLine, DerivedArc, ExactPoint } from './derived-path.js';
import { biAdd, biSub, biMul, biScale, eliminate, divideDiagonal, divideAffine, linearFibreRelation } from './elimination.js';
import type { Bivariate } from './elimination.js';

export interface OffsetCurve {
  controls:readonly Coordinate[];
  width:number;
  winding:Winding;
}
export function tangentPolynomials(curve:OffsetCurve) {
  if(!Number.isFinite(curve.width)||curve.width<0||(curve.winding!==1&&curve.winding!==-1))throw new OffsetCalculationError('INVALID_OFFSET_PARAMETERS');
  const p=curvePolynomials(curve.controls),dx=derivative(p.x,Q),dy=derivative(p.y,Q),common=gcd(dx,dy,Q);
  if(!common.length)throw new OffsetCalculationError('CONSTANT_SEGMENT');
  // A common even zero has a continuous normal. A common odd interior zero
  // needs distinct left/right branches and must not disappear by cancellation.
  const sample=(poly:Rational[],at:Rational):number=>{
    let current=poly;while(current.length){const sign=Q.sign(evaluate(current,at,Q));if(sign)return sign;current=derivative(current,Q);}return 0;
  };
  const sign=sample(common,Q.zero);
  return {p,common,initialSign:sign,x:scale(exactDivide(dx,common,Q),q(BigInt(sign)),Q),y:scale(exactDivide(dy,common,Q),q(BigInt(sign)),Q)};
}
const lift=(f:AlgebraicContext,p:readonly Rational[])=>p.map(c=>f.fromRational(c));
function singleNormalBranch(common:Rational[]):boolean {
  for(const root of isolateRoots(common,Q.zero,Q.one,Q)){
    const field=new RootField(Q,root),t=field.generator;
    if(root.multiplicity%2&&field.sign(t)>0&&field.sign(field.sub(t,field.one))<0)return false;
  }
  return true;
}
function normalSigns(f:AlgebraicContext,common:Rational[],initial:number,t:Exact):number[] {
  let d=common,order=0,sign=f.sign(evaluate(lift(f,d),t,f));
  while(!sign&&d.length){d=derivative(d,Q);order++;sign=f.sign(evaluate(lift(f,d),t,f));}
  if(!sign)throw new OffsetCalculationError('UNRESOLVED_STATIONARY_NORMAL');
  const right=sign*initial,left=order%2?-right:right;
  if(f.sign(t)===0)return [right];if(f.compare(t,f.one)===0)return [left];
  return left===right?[right]:[left,right];
}
export function evaluateDerivedOffset(f:AlgebraicContext,curve:OffsetCurve,t:Exact):ExactPoint {
  const {p,x,y,common,initialSign}=tangentPolynomials(curve);
  if(f.sign(t)<0||f.compare(t,f.one)>0)throw new OffsetCalculationError('PARAMETER_OUT_OF_RANGE');
  if(curve.width===0)return {x:evaluate(lift(f,p.x),t,f),y:evaluate(lift(f,p.y),t,f)};
  const commonAt=evaluate(lift(f,common),t,f);
  if(f.sign(commonAt)===0&&f.sign(t)>0&&f.compare(t,f.one)<0){
    let d=common,order=0;while(d.length&&f.sign(evaluate(lift(f,d),t,f))===0){order++;d=derivative(d,Q);}
    if(order%2)throw new OffsetCalculationError('STATIONARY_BRANCH_REQUIRES_SPLIT');
  }
  const vx=evaluate(lift(f,x),t,f),vy=evaluate(lift(f,y),t,f),speed=f.sqrt(f.add(f.square(vx),f.square(vy)));
  if(f.sign(speed)===0)throw new OffsetCalculationError('UNRESOLVED_STATIONARY_NORMAL');
  const d=f.number(curve.width*curve.winding*normalSigns(f,common,initialSign,t)[0]!);
  return {x:f.add(evaluate(lift(f,p.x),t,f),f.div(f.mul(d,vy),speed)),y:f.sub(evaluate(lift(f,p.y),t,f),f.div(f.mul(d,vx),speed))};
}
export interface CurveHit {point:ExactPoint;curveParameter:Exact;otherParameter:Exact|null}
function signedSpeed(f:AlgebraicContext,h:Exact,k:Exact,speed2:Exact):Exact|null {
  const hs=f.sign(h),ks=f.sign(k);
  // h*sqrt(S)+k=0, with S>0. The squared equation is already certified by
  // root isolation; opposite signs select its positive-radical branch.
  if(f.sign(speed2)<=0)throw new OffsetCalculationError('UNRESOLVED_STATIONARY_NORMAL');
  if(!hs)return ks?null:f.sqrt(speed2);
  if(!ks||hs===ks)return null;
  return f.div(f.sub(f.zero,k),h);
}
function atKnownSpeed(f:AlgebraicContext,curve:OffsetCurve,t:Exact,speed:Exact):ExactPoint {
  const {p,x,y}=tangentPolynomials(curve),d=f.number(curve.width*curve.winding);
  return {x:f.add(evaluate(lift(f,p.x),t,f),f.div(f.mul(d,evaluate(lift(f,y),t,f)),speed)),y:f.sub(evaluate(lift(f,p.y),t,f),f.div(f.mul(d,evaluate(lift(f,x),t,f)),speed))};
}
/** A supporting tangent of the base curve, shifted outward by exactly width,
 * cannot meet an interior offset point when the Bernstein control hull lies
 * strictly on its inner side. Every interior Bernstein weight is positive;
 * a unit normal contributes at most width in the support direction. Thus only
 * endpoints can meet this line. This is an exact certificate, not a tolerance. */
function supportingEndpointHits(f:AlgebraicContext,curve:OffsetCurve,line:DerivedLine,direction:ExactPoint,v:ExactPoint,v2:Exact):CurveHit[]|null{
 if(curve.width===0)return null;
 const cross=(a:ExactPoint,b:ExactPoint)=>f.sub(f.mul(a.x,b.y),f.mul(a.y,b.x));
 const endpoints=[f.zero,f.one].map(t=>({t,point:evaluateDerivedOffset(f,curve,t)}));
 for(let index=0;index<2;index++){
  const endpoint=endpoints[index]!,baseControl=curve.controls[index===0?0:curve.controls.length-1]!;
  const base={x:f.number(baseControl.x),y:f.number(baseControl.y)},shift=vector(f,endpoint.point,base);
  if(f.sign(cross(direction,vector(f,endpoint.point,line.start)))!==0||f.sign(dot(f,shift,direction))!==0)continue;
  const outside=f.sign(cross(direction,shift));if(!outside)continue;
  const sides=curve.controls.map(p=>f.sign(cross(direction,vector(f,{x:f.number(p.x),y:f.number(p.y)},base)))*outside);
  if(sides.some(s=>s>0)||!sides.some(s=>s<0))continue;
  const hits:CurveHit[]=[];
  for(const {t,point} of endpoints){
   if(f.sign(cross(direction,vector(f,point,line.start)))!==0)continue;
   const u=f.div(dot(f,vector(f,point,line.start),v),v2);
   if(f.sign(u)>=0&&f.compare(u,f.one)<=0)hits.push({point,curveParameter:t,otherParameter:u});
  }
  return hits;
 }
 return null;
}
/** Intersect the actual normal-offset trajectory with a finite line. Squaring
 * only generates candidates; the original signed equation is checked exactly. */
export function intersectOffsetLine(f:AlgebraicContext,curve:OffsetCurve,line:DerivedLine):CurveHit[] {
  const {p,x,y,common,initialSign}=tangentPolynomials(curve),v=vector(f,line.end,line.start),v2=dot(f,v,v);
  if(f.sign(v2)===0)throw new OffsetCalculationError('CONSTANT_INTERSECTION_SUPPORT');
  // Remove arbitrary segment length and position along its support before
  // elimination. In particular a trimmed endpoint must not inject its whole
  // algebraic extension into an otherwise rational vertical/horizontal line.
  const direction=f.sign(v.x)!==0?{x:f.one,y:f.div(v.y,v.x)}:{x:f.zero,y:f.one};
  const supported=supportingEndpointHits(f,curve,line,direction,v,v2);if(supported!==null)return supported;
  const anchor=f.sign(v.x)!==0?{x:f.zero,y:f.sub(line.start.y,f.mul(direction.y,line.start.x))}:{x:line.start.x,y:f.zero};
  const bx=polynomialSubtract(lift(f,p.x),[anchor.x],f),by=polynomialSubtract(lift(f,p.y),[anchor.y],f);
  const h=polynomialSubtract(scale(bx,direction.y,f),scale(by,direction.x,f),f);
  const tx=lift(f,x),ty=lift(f,y),speed2=polynomialAdd(polynomialMultiply(tx,tx,f),polynomialMultiply(ty,ty,f),f);
  const k=scale(polynomialAdd(scale(tx,direction.x,f),scale(ty,direction.y,f),f),f.number(curve.width*curve.winding),f);
  const equation=polynomialSubtract(polynomialMultiply(polynomialMultiply(h,h,f),speed2,f),polynomialMultiply(k,k,f),f);
  if(!equation.length)throw new OffsetCalculationError('OFFSET_COMMON_COMPONENT_REQUIRES_CLASSIFICATION');
  const hits:CurveHit[]=[];
  for(const t of f.roots(equation)){
    for(const sign of normalSigns(f,common,initialSign,t)){
      const speed=signedSpeed(f,evaluate(h,t,f),f.mul(f.number(sign),evaluate(k,t,f)),evaluate(speed2,t,f));if(!speed)continue;
      const point=atKnownSpeed(f,{...curve,winding:curve.winding*sign as Winding},t,speed),u=f.div(dot(f,vector(f,point,line.start),v),v2);
      if(f.sign(u)>=0&&f.compare(u,f.one)<=0)hits.push({point,curveParameter:t,otherParameter:u});
    }
  }
  return hits;
}
export function intersectOffsetArc(f:AlgebraicContext,curve:OffsetCurve,arc:DerivedArc):CurveHit[] {
  const {p,x,y,common,initialSign}=tangentPolynomials(curve),bx=polynomialSubtract(lift(f,p.x),[arc.center.x],f),by=polynomialSubtract(lift(f,p.y),[arc.center.y],f);
  const tx=lift(f,x),ty=lift(f,y),speed2=polynomialAdd(polynomialMultiply(tx,tx,f),polynomialMultiply(ty,ty,f),f);
  const h=polynomialAdd(polynomialAdd(polynomialMultiply(bx,bx,f),polynomialMultiply(by,by,f),f),[f.sub(f.square(f.number(curve.width)),f.square(arc.radius))],f);
  const k=scale(polynomialSubtract(polynomialMultiply(bx,ty,f),polynomialMultiply(by,tx,f),f),f.mul(f.number(2),f.number(curve.width*curve.winding)),f);
  const equation=polynomialSubtract(polynomialMultiply(polynomialMultiply(h,h,f),speed2,f),polynomialMultiply(k,k,f),f);
  if(!equation.length)throw new OffsetCalculationError('OFFSET_COMMON_COMPONENT_REQUIRES_CLASSIFICATION');
  const hits:CurveHit[]=[];
  for(const t of f.roots(equation)){
    for(const sign of normalSigns(f,common,initialSign,t)){
      const speed=signedSpeed(f,evaluate(h,t,f),f.mul(f.number(sign),evaluate(k,t,f)),evaluate(speed2,t,f));if(!speed)continue;
      const point=atKnownSpeed(f,{...curve,winding:curve.winding*sign as Winding},t,speed);if(onArc(f,arc,point))hits.push({point,curveParameter:t,otherParameter:null});
    }
  }
  return hits;
}
/** Select the first local encounter while walking back from the incoming end
 * and forward from the outgoing start. Incomparable encounters are not silently
 * resolved by jumping over a loop. */
export function trimOffsetLineCorner(f:AlgebraicContext,curve:OffsetCurve,line:DerivedLine,curveIsIncoming:boolean):CurveHit|null {
  return selectOffsetLineTrim(f,curve,intersectOffsetLine(f,curve,line),curveIsIncoming);
}
export function selectOffsetLineTrim(f:AlgebraicContext,curve:OffsetCurve,candidates:readonly CurveHit[],curveIsIncoming:boolean):CurveHit|null {
  const hits=candidates.filter(h=>retainedTrimSide(f,curve,h.curveParameter,h.point,curveIsIncoming?'left':'right'));
  if(!hits.length)return null;
  const preferred=(a:CurveHit,b:CurveHit)=>curveIsIncoming?
    f.compare(a.curveParameter,b.curveParameter)>=0&&f.compare(a.otherParameter!,b.otherParameter!)<=0:
    f.compare(a.curveParameter,b.curveParameter)<=0&&f.compare(a.otherParameter!,b.otherParameter!)>=0;
  const first=hits.find(a=>hits.every(b=>preferred(a,b)));
  if(!first)throw new OffsetCalculationError('AMBIGUOUS_LOCAL_TRIM');
  return first;
}
function retainedTrimSide(f:AlgebraicContext,curve:OffsetCurve,t:Exact,point:ExactPoint,side:'left'|'right'):boolean {
  const {common}=tangentPolynomials(curve);if(f.sign(evaluate(lift(f,common),t,f))!==0)return true;
  const at=splitStationaryOffset(f,curve).breaks.find(b=>f.compare(b.parameter,t)===0),limit=at?.[side];
  return !!limit&&f.compare(limit.x,point.x)===0&&f.compare(limit.y,point.y)===0;
}

/** Separate the exact stationary parameters and retain BOTH one-sided offset
 * limits. A jump is reported, never bridged by an invented connector. */
export function splitStationaryOffset(f:AlgebraicContext,curve:OffsetCurve) {
  const {p,common}=tangentPolynomials(curve),dx=derivative(p.x,Q),dy=derivative(p.y,Q);
  const parameters=f.roots(lift(f,common));
  const breaks=parameters.map(t=>{
    let x=dx,y=dy,order=0;
    while(f.sign(evaluate(lift(f,x),t,f))===0&&f.sign(evaluate(lift(f,y),t,f))===0){x=derivative(x,Q);y=derivative(y,Q);order++;}
    const tx=evaluate(lift(f,x),t,f),ty=evaluate(lift(f,y),t,f),speed=f.sqrt(f.add(f.square(tx),f.square(ty))),d=f.number(curve.width*curve.winding);
    const center={x:evaluate(lift(f,p.x),t,f),y:evaluate(lift(f,p.y),t,f)};
    const limit=(sign:number):ExactPoint=>({x:f.add(center.x,f.div(f.mul(f.mul(d,f.number(sign)),ty),speed)),y:f.sub(center.y,f.div(f.mul(f.mul(d,f.number(sign)),tx),speed))});
    const left=f.sign(t)>0?limit(order%2?-1:1):null,right=f.compare(t,f.one)<0?limit(1):null;
    return {parameter:t,order,left,right,continuous:!left||!right||curve.width===0||order%2===0};
  });
  const interior=breaks.filter(b=>f.sign(b.parameter)>0&&f.compare(b.parameter,f.one)<0);
  const boundaries=[f.zero,...interior.map(b=>b.parameter),f.one];
  return {breaks,intervals:boundaries.slice(0,-1).map((start,i)=>({start,end:boundaries[i+1]!}))};
}

export interface OffsetPairHit {point:ExactPoint;incomingParameter:Exact;outgoingParameter:Exact}
export class CoincidentOffsetError extends Error {constructor(){super('Los márgenes comparten un tramo.');this.name='CoincidentOffsetError';}}
const pairCache=new WeakMap<AlgebraicContext,Map<string,OffsetPairHit[]>>();
/** Polynomial elimination of the two unit-normal equations. Squared equations
 * only locate candidates; positive speeds and equality of actual offsets are
 * checked in the algebraic fibre before any contact is returned. */
export function intersectOffsetCurves(f:AlgebraicContext,a:OffsetCurve,b:OffsetCurve,self=false):OffsetPairHit[] {
  tangentPolynomials(a);tangentPolynomials(b);
  if(a.width===0||b.width===0)throw new OffsetCalculationError('POSITIVE_OFFSET_PAIR_REQUIRED');
  const key=JSON.stringify([a.controls,a.width,a.winding,b.controls,b.width,b.winding,self]);
  let cache=pairCache.get(f);if(!cache){cache=new Map();pairCache.set(f,cache);}
  const prior=cache.get(key);if(prior)return prior.map(h=>({...h,point:{...h.point}}));
  const local=new AlgebraicContext();
  const hits=solveOffsetCurves(local,a,b,self).map(hit=>({point:{x:f.import(hit.point.x),y:f.import(hit.point.y)},incomingParameter:f.import(hit.incomingParameter),outgoingParameter:f.import(hit.outgoingParameter)}));
  cache.set(key,hits);return hits.map(h=>({...h,point:{...h.point}}));
}
function solveOffsetCurves(f:AlgebraicContext,a:OffsetCurve,b:OffsetCurve,self:boolean):OffsetPairHit[] {
  const A=tangentPolynomials(a),B=tangentPolynomials(b);
  const T=(p:Rational[]):Bivariate=>p.map(c=>[c]),U=(p:Rational[]):Bivariate=>[p];
  const ax=T(A.p.x),ay=T(A.p.y),bx=U(B.p.x),by=U(B.p.y),dx=biSub(bx,ax),dy=biSub(by,ay);
  const nax=biScale(T(A.y),q(BigInt(a.winding))),nay=biScale(T(A.x),q(BigInt(-a.winding)));
  const nbx=biScale(U(B.y),q(BigInt(b.winding))),nby=biScale(U(B.x),q(BigInt(-b.winding)));
  const cross=(x:Bivariate,y:Bivariate,z:Bivariate,w:Bivariate)=>biSub(biMul(x,w),biMul(y,z));
  const C=cross(nax,nay,nbx,nby),ha=cross(dx,dy,nbx,nby),hb=cross(dx,dy,nax,nay);
  const sa=biAdd(biMul(nax,nax),biMul(nay,nay)),sb=biAdd(biMul(nbx,nbx),biMul(nby,nby)),c2=biMul(C,C);
  const da=f.number(a.width),db=f.number(b.width);
  let F=biSub(biMul(biMul(ha,ha),sa),biScale(c2,Q.mul(fromWidth(a.width),fromWidth(a.width))));
  let G=biSub(biMul(biMul(hb,hb),sb),biScale(c2,Q.mul(fromWidth(b.width),fromWidth(b.width))));
  if(self){F=divideDiagonal(divideDiagonal(F));G=divideDiagonal(divideDiagonal(G));}
  const hits:OffsetPairHit[]=[];
  let projection=eliminate(F,G);
  if(!projection.length&&!self){
    const {alpha,beta}=affine(A.p,B.p);
    if(a.width===b.width&&a.winding===b.winding*Q.sign(alpha)){
      const end=Q.add(alpha,beta),lo=Q.sign(Q.sub(beta,end))<0?beta:end,hi=Q.sign(Q.sub(beta,end))<0?end:beta;
      const left=Q.sign(lo)>0?lo:Q.zero,right=Q.sign(Q.sub(hi,Q.one))<0?hi:Q.one,order=Q.sign(Q.sub(left,right));
      if(order<0)throw new CoincidentOffsetError();
      if(order===0){const t=f.fromRational(left),u=f.fromRational(Q.div(Q.sub(left,beta),alpha));hits.push({point:evaluateDerivedOffset(f,a,t),incomingParameter:t,outgoingParameter:u});}
    }
    F=divideAffine(divideAffine(F,alpha,beta),alpha,beta);G=divideAffine(divideAffine(G,alpha,beta),alpha,beta);projection=eliminate(F,G);
  }
  const normB=polynomialAdd(polynomialMultiply(B.x,B.x,Q),polynomialMultiply(B.y,B.y,Q),Q);
  if(projection.length)while(true){const factor=gcd(projection,normB,Q);if(factor.length<2)break;projection=exactDivide(projection,factor,Q);}
  if(!projection.length)throw new OffsetCalculationError('OFFSET_PAIR_COMMON_COMPONENT_REQUIRES_CLASSIFICATION');
  const linear=linearFibreRelation(F,G);
  for(const u of f.roots(lift(f,projection))){
    const fibre=(p:Bivariate)=>p.map(c=>evaluate(lift(f,c),u,f));
    let parameters:Exact[];
    if(linear&&linear.guards.every(g=>f.sign(evaluate(lift(f,g),u,f))!==0)){
      const relation=fibre(linear.relation),lead=relation[1]!;
      if(f.sign(lead)!==0){const t=f.div(f.sub(f.zero,relation[0]!),lead);parameters=f.sign(t)>=0&&f.compare(t,f.one)<=0?[t]:[];}
      else if(f.sign(relation[0]!)!==0)parameters=[];
      else {const h=gcd(fibre(F),fibre(G),f);if(!h.length)throw new OffsetCalculationError('OFFSET_PAIR_NON_FINITE_FIBRE');parameters=f.roots(h);}
    }else {const h=gcd(fibre(F),fibre(G),f);if(!h.length)throw new OffsetCalculationError('OFFSET_PAIR_NON_FINITE_FIBRE');parameters=f.roots(h);}
    for(const t of parameters){
      if(f.sign(evaluate(fibre(F),t,f))!==0||f.sign(evaluate(fibre(G),t,f))!==0)continue;
      if(self&&f.compare(t,u)>=0)continue;
      const at=(p:Bivariate)=>evaluate(fibre(p),t,f),c=at(C),left=at(ha),right=at(hb);
      for(const signA of normalSigns(f,A.common,A.initialSign,t))for(const signB of normalSigns(f,B.common,B.initialSign,u)){
      let pointA:ExactPoint,pointB:ExactPoint;
      if(f.sign(c)!==0){
        if(f.sign(left)===0||f.sign(right)===0)continue;
        const speedA=f.div(f.mul(f.mul(da,f.number(signA)),c),left),speedB=f.div(f.mul(f.mul(db,f.number(signB)),c),right);
        if(f.sign(speedA)<=0||f.sign(speedB)<=0)continue;
        pointA=atKnownSpeed(f,{...a,winding:a.winding*signA as Winding},t,speedA);pointB=atKnownSpeed(f,{...b,winding:b.winding*signB as Winding},u,speedB);
      }else {
        pointA=atKnownSpeed(f,{...a,winding:a.winding*signA as Winding},t,f.sqrt(at(sa)));
        pointB=atKnownSpeed(f,{...b,winding:b.winding*signB as Winding},u,f.sqrt(at(sb)));
      }
      if(f.compare(pointA.x,pointB.x)===0&&f.compare(pointA.y,pointB.y)===0)hits.push({point:pointA,incomingParameter:t,outgoingParameter:u});
      }
    }
  }
  return hits;
}
function fromWidth(width:number):Rational {return fromNumber(width);}
export function trimOffsetCurveCorner(f:AlgebraicContext,a:OffsetCurve,b:OffsetCurve):OffsetPairHit|null {
  const hits=intersectOffsetCurves(f,a,b).filter(h=>retainedTrimSide(f,a,h.incomingParameter,h.point,'left')&&retainedTrimSide(f,b,h.outgoingParameter,h.point,'right'));
  if(!hits.length)return null;
  const first=hits.find(p=>hits.every(other=>f.compare(p.incomingParameter,other.incomingParameter)>=0&&f.compare(p.outgoingParameter,other.outgoingParameter)<=0));
  if(!first)throw new OffsetCalculationError('AMBIGUOUS_LOCAL_TRIM');return first;
}
function nonnegativeOnUnitInterval(p:Rational[]):boolean{
 if(Q.sign(evaluate(p,Q.zero,Q))<0||Q.sign(evaluate(p,Q.one,Q))<0)return false;
 const d=derivative(p,Q);
 if(d.length)for(const r of isolateRoots(d,Q.zero,Q.one,Q)){const field=new RootField(Q,r);if(field.sign(evaluate(p.map(c=>field.fromRational(c)),field.generator,field))<0)return false;}
 return true;
}
export function offsetCriticalParameters(f:AlgebraicContext,curve:OffsetCurve,directions:readonly {x:number|Exact;y:number|Exact}[]=[{x:1,y:0},{x:0,y:1}]):Exact[] {
  const {p,x,y,common}=tangentPolynomials(curve);
  const times:Exact[]=[f.zero,f.one];
  // Offset tangents are parallel to the base tangent, except at a zero speed
  // factor (included below). Project before differentiating: rotating rounded
  // controls would change the very geometry whose extrema we must certify.
  for(const direction of directions){
    const coordinate=(v:number|Exact)=>typeof v==='number'?f.number(v):f.import(v);
    const projection=polynomialAdd(scale(lift(f,p.x),coordinate(direction.x),f),scale(lift(f,p.y),coordinate(direction.y),f),f),d=derivative(projection,f);
    if(d.length)times.push(...f.roots(d));
  }
  const S=polynomialAdd(polynomialMultiply(x,x,Q),polynomialMultiply(y,y,Q),Q);
  const K=polynomialSubtract(polynomialMultiply(x,derivative(y,Q),Q),polynomialMultiply(y,derivative(x,Q),Q),Q);
  // Outward signed curvature >= 0 makes the offset speed factor strictly
  // positive. Squaring its equation would introduce the opposite normal
  // branch and needlessly isolate a high-degree polynomial with huge dyadics.
  if(curve.width===0||nonnegativeOnUnitInterval(scale(K,q(BigInt(curve.winding)),Q)))return times;
  const S3=polynomialMultiply(polynomialMultiply(S,S,Q),S,Q),width=fromNumber(curve.width);
  const singular=polynomialSubtract(polynomialMultiply(polynomialMultiply(common,common,Q),S3,Q),scale(polynomialMultiply(K,K,Q),Q.mul(width,width),Q),Q);
  if(!singular.length)throw new OffsetCalculationError('CONSTANT_OFFSET_REQUIRES_CLASSIFICATION');
  times.push(...f.roots(lift(f,singular)));return times;
}
/** Sufficient exact injectivity certificate: a monotone base projection and a
 * positive offset speed factor preserve that monotonicity. Failure to prove it
 * is not a geometric defect; callers use full self-intersection elimination. */
export function proveOffsetInjective(curve:OffsetCurve):boolean {
  const {p,x,y,common}=tangentPolynomials(curve);if(!singleNormalBranch(common))return false;
  const interior=(root:ReturnType<typeof isolateRoots<Rational>>[number])=>{const K=new RootField(Q,root),t=K.generator;return K.sign(t)>0&&K.sign(K.sub(t,K.one))<0;};
  const monotone=(['x','y'] as const).some(axis=>{const d=derivative(p[axis],Q);return d.length>0&&!isolateRoots(d,Q.zero,Q.one,Q).some(r=>r.multiplicity%2&&interior(r));});
  if(!monotone)return false;
  const S=polynomialAdd(polynomialMultiply(x,x,Q),polynomialMultiply(y,y,Q),Q),K=scale(polynomialSubtract(polynomialMultiply(x,derivative(y,Q),Q),polynomialMultiply(y,derivative(x,Q),Q),Q),q(BigInt(curve.winding)),Q);
  if(nonnegativeOnUnitInterval(K))return true;
  const S3=polynomialMultiply(polynomialMultiply(S,S,Q),S,Q),d=fromNumber(curve.width);
  const H=polynomialSubtract(polynomialMultiply(polynomialMultiply(common,common,Q),S3,Q),scale(polynomialMultiply(K,K,Q),Q.mul(d,d),Q),Q);
  return H.length>0&&countRoots(H,Q.zero,Q.one,Q)===0&&Q.sign(evaluate(H,q(1n,2n),Q))>0;
}
