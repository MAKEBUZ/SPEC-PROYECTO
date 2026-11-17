import { AlgebraicContext } from './algebraic.js';
import type { Exact } from './algebraic.js';
import { assertContour } from './model.js';
import type { Contour } from './model.js';
import { segmentControls, analyzeContour } from './contour-validation.js';
import { curvePolynomials } from './intersections.js';
import { derivative, evaluate, rationals as Q } from './polynomials.js';
import { rational as q, compare, add, subtract, multiply, divide, fromNumber } from './numeric.js';
import type { Rational } from './numeric.js';
import { OffsetCalculationError } from './joins.js';
import { validateOffset } from './offset.js';
import type { OffsetSource } from './offset.js';
import { validateDerivedPath, onArc } from './derived-path.js';
import type { ExactPoint } from './derived-path.js';
import type { MarginPrimitive } from './curved-margin.js';
import { tangentPolynomials, offsetCriticalParameters, evaluateDerivedOffset } from './offset-intersections.js';

/** Exact extrema, never the control polygon's bounding box. */
export function dimensionsOfPoints(field:AlgebraicContext,points:readonly ExactPoint[]) {
  if(!points.length)throw new OffsetCalculationError('EMPTY_DIMENSION_DOMAIN');
  let minX=points[0]!.x,maxX=minX,minY=points[0]!.y,maxY=minY;
  for(const p of points){
    if(field.compare(p.x,minX)<0)minX=p.x;if(field.compare(p.x,maxX)>0)maxX=p.x;
    if(field.compare(p.y,minY)<0)minY=p.y;if(field.compare(p.y,maxY)>0)maxY=p.y;
  }
  const width=field.sub(maxX,minX),height=field.sub(maxY,minY),limit=field.number(5000);
  const widthWithinLimit=field.compare(width,limit)<=0,heightWithinLimit=field.compare(height,limit)<=0;
  return {field,bounds:{minX,maxX,minY,maxY},width,height,widthWithinLimit,heightWithinLimit,
    exceeded:[...widthWithinLimit?[]:['width' as const],...heightWithinLimit?[]:['height' as const]]};
}
export function contourDimensions(contour:Contour){
  assertContour(contour);const f=new AlgebraicContext();
  const points=contour.segments.flatMap(s=>{
    const p=curvePolynomials(segmentControls(contour,s.id)),parameters=[f.zero,f.one];
    for(const axis of ['x','y'] as const){const d=derivative(p[axis],Q);if(d.length)parameters.push(...f.roots(d.map(v=>f.fromRational(v))));}
    return parameters.map(t=>({x:evaluate(p.x.map(v=>f.fromRational(v)),t,f),y:evaluate(p.y.map(v=>f.fromRational(v)),t,f)}));
  });
  return dimensionsOfPoints(f,points);
}
export function marginDimensions(f:AlgebraicContext,path:readonly MarginPrimitive[]){
  return dimensionsOfPoints(f,path.flatMap(p=>{
    if(p.kind==='line')return [p.start,p.end];
    if(p.kind==='offset')return [p.start,p.end,...offsetCriticalParameters(f,p.curve).filter(t=>f.compare(t,p.from)>0&&f.compare(t,p.to)<0).map(t=>evaluateDerivedOffset(f,p.curve,t))];
    const c=p.center,r=p.radius;
    return [p.start,p.end,...[{x:f.add(c.x,r),y:c.y},{x:f.sub(c.x,r),y:c.y},{x:c.x,y:f.add(c.y,r)},{x:c.x,y:f.sub(c.y,r)}].filter(v=>onArc(f,p,v))];
  }));
}

interface Interval {lo:Rational;hi:Rational}
const zero=q(0n),one=q(1n),two=q(2n);
const exact=(v:Rational):Interval=>({lo:v,hi:v});
const plus=(a:Interval,b:Interval):Interval=>({lo:add(a.lo,b.lo),hi:add(a.hi,b.hi)});
const minus=(a:Interval,b:Interval):Interval=>({lo:subtract(a.lo,b.hi),hi:subtract(a.hi,b.lo)});
const min=(a:Rational,b:Rational)=>compare(a,b)<0?a:b;
const max=(a:Rational,b:Rational)=>compare(a,b)>0?a:b;
const times=(a:Interval,b:Interval):Interval=>{
  const v=[multiply(a.lo,b.lo),multiply(a.lo,b.hi),multiply(a.hi,b.lo),multiply(a.hi,b.hi)];
  return {lo:v.reduce(min),hi:v.reduce(max)};
};
const square=(a:Interval):Interval=>({lo:compare(a.lo,zero)<=0&&compare(a.hi,zero)>=0?zero:min(multiply(a.lo,a.lo),multiply(a.hi,a.hi)),hi:max(multiply(a.lo,a.lo),multiply(a.hi,a.hi))});
const magnitude=(a:Interval)=>max(Q.sign(a.lo)<0?Q.sub(zero,a.lo):a.lo,Q.sign(a.hi)<0?Q.sub(zero,a.hi):a.hi);
class Refine extends Error {}
const quotient=(a:Interval,b:Interval):Interval=>{
  if(compare(b.lo,zero)<=0&&compare(b.hi,zero)>=0)throw new Refine();
  return times(a,{lo:divide(one,b.hi),hi:divide(one,b.lo)});
};
function integerSqrt(n:bigint):bigint{
  if(n<2n)return n;let x=1n<<BigInt(Math.ceil(n.toString(2).length/2));
  for(;;){const next=(x+n/x)/2n;if(next>=x)return x;x=next;}
}
/** Outward dyadic sqrt bounds. Relative precision avoids a scale floor. */
function root(a:Interval,relativeBits=48):Interval{
  if(compare(a.lo,zero)<=0)throw new Refine();
  const bound=(v:Rational,upper:boolean)=>{
    const bits=Math.max(0,Math.ceil((v.d.toString(2).length-v.n.toString(2).length)/2)+relativeBits),scale=1n<<BigInt(bits);
    const n=integerSqrt(v.n*scale*scale/v.d);
    return q(upper&&n*n*v.d!==v.n*scale*scale?n+1n:n,scale);
  };
  return {lo:bound(a.lo,false),hi:bound(a.hi,true)};
}
function enclose(f:AlgebraicContext,v:Exact,precision:Rational):Interval{
  if(v.level===0&&!Array.isArray(v.raw))return exact(v.raw);
  const known=f.enclosingInterval(v);
  if(compare(subtract(known.hi,known.lo),precision)<=0)return known;
  let lo=q(-1n),hi=one;
  while(f.compare(v,f.fromRational(lo))<0)lo=multiply(lo,two);
  while(f.compare(v,f.fromRational(hi))>0)hi=multiply(hi,two);
  while(compare(subtract(hi,lo),precision)>0){
    const middle=divide(add(lo,hi),two),s=f.compare(v,f.fromRational(middle));
    if(!s)return exact(middle);if(s<0)hi=middle;else lo=middle;
  }
  return {lo,hi};
}
const polynomial=(p:readonly Rational[],t:Interval)=>p.reduceRight((v,c)=>plus(times(v,t),exact(c)),exact(zero));
const center=(a:Interval)=>divide(add(a.lo,a.hi),two);
type Box={x:Interval;y:Interval};
export interface RationalPoint {x:Rational;y:Rational}
export interface ApproximationSegment {start:RationalPoint;end:RationalPoint;sourceId:string;parameterFrom:Rational;parameterTo:Rational;errorUpper:Rational}
/** Bound the second derivative of v/|v| over the WHOLE parameter interval. */
function unitSecond(v:Box,d:Box,dd:Box):Box{
  const S=plus(square(v.x),square(v.y)),s=root(S),s3=times(S,s),s5=times(S,s3);
  const Sp=times(exact(two),plus(times(v.x,d.x),times(v.y,d.y)));
  const Spp=times(exact(two),plus(plus(square(d.x),square(d.y)),plus(times(v.x,dd.x),times(v.y,dd.y))));
  const axis=(k:'x'|'y')=>plus(minus(minus(quotient(dd[k],s),quotient(times(d[k],Sp),s3)),quotient(times(v[k],Spp),times(exact(two),s3))),quotient(times(exact(q(3n)),times(v[k],square(Sp))),times(exact(q(4n)),s5)));
  return {x:axis('x'),y:axis('y')};
}

/** Uniform L1 bound implies the Euclidean 0.01 mm contract. All vertices are
 * rationals; rounding to binary64 is deliberately left to a certified consumer. */
export function approximateMargin(piece:OffsetSource,tolerance:Rational=q(1n,100n)){
  if(compare(tolerance,zero)<=0||compare(tolerance,q(1n,100n))>0)throw new OffsetCalculationError('INVALID_APPROXIMATION_TOLERANCE');
  return approximateEvaluatedMargin(piece,validateOffset(piece),tolerance);
}
/** Captures a private snapshot and certificate for a single evaluation. No
 * caller-supplied validity assertion can bypass offset validation. */
export function evaluateMargin(piece:OffsetSource){
  const snapshot=structuredClone(piece),validation=validateOffset(snapshot);
  return {validation,approximate:(tolerance:Rational=q(1n,100n))=>approximateEvaluatedMargin(snapshot,validation,tolerance)};
}
function approximateEvaluatedMargin(piece:OffsetSource,source:ReturnType<typeof validateOffset>,tolerance:Rational){
  if(compare(tolerance,zero)<=0||compare(tolerance,q(1n,100n))>0)throw new OffsetCalculationError('INVALID_APPROXIMATION_TOLERANCE');
  if(source.kind!=='validated'&&source.kind!=='validated-coincident')return source;
  const f=source.kind==='validated'?source.field:new AlgebraicContext();
  const winding=Q.sign(analyzeContour(piece.contour).signedArea!) as 1|-1;
  const path:readonly MarginPrimitive[]=source.kind==='validated'?source.path:piece.contour.segments.map(s=>{
    const controls=segmentControls(piece.contour,s.id),start={x:f.number(controls[0]!.x),y:f.number(controls[0]!.y)},end={x:f.number(controls.at(-1)!.x),y:f.number(controls.at(-1)!.y)};
    return s.kind==='line'?{kind:'line',sourceId:s.id,start,end}:{kind:'offset',sourceId:s.id,start,end,from:f.zero,to:f.one,curve:{controls,width:0,winding}};
  });
  const dimensions=marginDimensions(f,path);
  const lowerPositive=(v:Exact)=>{let b=one;while(f.compare(f.fromRational(b),v)>0)b=divide(b,two);return b;};
  const scale=min(lowerPositive(dimensions.width),lowerPositive(dimensions.height));
  let budget=min(tolerance,divide(source.width>0?min(fromNumber(source.width),scale):scale,q(16n)));
  // Resource exhaustion is a technical failure, never geometric invalidity.
  for(let pass=0;pass<32;pass++,budget=divide(budget,two)){
    const precision=divide(budget,q(4096n<<BigInt(pass*8))),segments:ApproximationSegment[]=[];
    const rootBits=128+precision.d.toString(2).length;
    const endpoint=(p:ExactPoint):Box=>({x:enclose(f,p.x,precision),y:enclose(f,p.y,precision)});
    const vertices=path.map(p=>endpoint(p.start));
    try{for(let index=0;index<path.length;index++){
      const p=path[index]!,first=vertices[index]!,last=vertices[(index+1)%path.length]!;
      const tangent=p.kind==='offset'?tangentPolynomials(p.curve):null;
      const from=p.kind==='offset'?enclose(f,p.from,precision):exact(zero),to=p.kind==='offset'?enclose(f,p.to,precision):exact(one);
      const span=minus(to,from);
      const at=(u:Interval):Interval=>plus(from,times(span,u));
      let normal=1;
      if(p.kind==='offset'&&tangent){
        const middle=f.div(f.add(p.from,p.to),f.number(2));
        normal=f.sign(evaluate(tangent.common.map(v=>f.fromRational(v)),middle,f))*tangent.initialSign;
        // A common even stationary midpoint has the same branch on both sides.
        if(!normal){let d=tangent.common;while(d.length&&!normal){d=derivative(d,Q);normal=f.sign(evaluate(d.map(v=>f.fromRational(v)),middle,f))*tangent.initialSign;}}
      }
      const arc=p.kind==='arc'?{c:endpoint(p.center),r:enclose(f,p.radius,precision),a:{x:minus(first.x,endpoint(p.center).x),y:minus(first.y,endpoint(p.center).y)},b:{x:minus(last.x,endpoint(p.center).x),y:minus(last.y,endpoint(p.center).y)}}:null;
      const curveBox=(u:Interval,second:boolean):Box=>{
        if(p.kind==='line')return second?{x:exact(zero),y:exact(zero)}:{x:plus(first.x,times(minus(last.x,first.x),u)),y:plus(first.y,times(minus(last.y,first.y),u))};
        if(arc){
          const d={x:minus(arc.b.x,arc.a.x),y:minus(arc.b.y,arc.a.y)},v={x:plus(arc.a.x,times(d.x,u)),y:plus(arc.a.y,times(d.y,u))};
          if(second){const dd=unitSecond(v,d,{x:exact(zero),y:exact(zero)});return {x:times(arc.r,dd.x),y:times(arc.r,dd.y)};}
          const norm=root(plus(square(v.x),square(v.y)),rootBits);
          return {x:plus(arc.c.x,times(arc.r,quotient(v.x,norm))),y:plus(arc.c.y,times(arc.r,quotient(v.y,norm)))};
        }
        if(p.kind!=='offset'||!tangent)throw new OffsetCalculationError('INVALID_APPROXIMATION_PRIMITIVE');
        const t=at(u),v={x:polynomial(tangent.x,t),y:polynomial(tangent.y,t)},width=exact(fromNumber(p.curve.width*p.curve.winding*normal));
        if(p.curve.width===0){
          const axis=(k:'x'|'y')=>second?times(square(span),polynomial(derivative(derivative(tangent.p[k],Q),Q),t)):polynomial(tangent.p[k],t);
          return {x:axis('x'),y:axis('y')};
        }
        if(second){
          const d={x:polynomial(derivative(tangent.x,Q),t),y:polynomial(derivative(tangent.y,Q),t)},dd={x:polynomial(derivative(derivative(tangent.x,Q),Q),t),y:polynomial(derivative(derivative(tangent.y,Q),Q),t)};
          const n=unitSecond(v,d,dd),scale=square(span);
          return {x:times(scale,plus(polynomial(derivative(derivative(tangent.p.x,Q),Q),t),times(width,n.y))),y:times(scale,minus(polynomial(derivative(derivative(tangent.p.y,Q),Q),t),times(width,n.x)))};
        }
        const norm=root(plus(square(v.x),square(v.y)),rootBits);
        return {x:plus(polynomial(tangent.p.x,t),times(width,quotient(v.y,norm))),y:minus(polynomial(tangent.p.y,t),times(width,quotient(v.x,norm)))};
      };
      const stack:{lo:Rational;hi:Rational;a:Box;b:Box}[]=[{lo:zero,hi:one,a:first,b:last}];
      while(stack.length){
        if(segments.length+stack.length>100000)throw new OffsetCalculationError('APPROXIMATION_RESOURCE_LIMIT');
        const cell=stack.pop()!,h=subtract(cell.hi,cell.lo);
        const radius=(b:Box)=>divide(add(subtract(b.x.hi,b.x.lo),subtract(b.y.hi,b.y.lo)),two);
        if(compare(max(radius(cell.a),radius(cell.b)),divide(budget,two))>0)throw new Refine();
        let error:Rational|null=null;
        try{const d2=curveBox({lo:cell.lo,hi:cell.hi},true);error=add(divide(multiply(multiply(h,h),add(magnitude(d2.x),magnitude(d2.y))),q(8n)),max(radius(cell.a),radius(cell.b)));}
        catch(e){if(!(e instanceof Refine))throw e;}
        if(error&&compare(error,budget)<=0){segments.push({sourceId:p.sourceId,parameterFrom:cell.lo,parameterTo:cell.hi,start:{x:center(cell.a.x),y:center(cell.a.y)},end:{x:center(cell.b.x),y:center(cell.b.y)},errorUpper:error});continue;}
        const mid=divide(add(cell.lo,cell.hi),two);
        const b=curveBox(exact(mid),false);
        if(cell.lo.d.toString(2).length>4096)throw new OffsetCalculationError('APPROXIMATION_RESOURCE_LIMIT');
        stack.push({lo:mid,hi:cell.hi,a:b,b:cell.b},{lo:cell.lo,hi:mid,a:cell.a,b});
      }
    }}catch(e){if(e instanceof Refine)continue;throw e;}
    const g=new AlgebraicContext(),lift=(p:RationalPoint)=>({x:g.fromRational(p.x),y:g.fromRational(p.y)});
    // An approximated microscopic join can collapse to a point already on its
    // neighbouring segments. It does not change the polygon's geometric set.
    // Retain its source and error certificate for distance/coverage consumers;
    // omit only this inert edge from the topology check, never from the model.
    const nonconstant=segments.filter(s=>compare(s.start.x,s.end.x)!==0||compare(s.start.y,s.end.y)!==0);
    const validation=validateDerivedPath(g,nonconstant.map(s=>({kind:'line' as const,sourceId:s.sourceId,start:lift(s.start),end:lift(s.end)})));
    const area=segments.reduce((sum,s)=>add(sum,subtract(multiply(s.start.x,s.end.y),multiply(s.start.y,s.end.x))),zero);
    if(Q.sign(area)===winding&&validation.defects.filter(d=>d!=='width-exceeded'&&d!=='height-exceeded').length===0)return {kind:'certified' as const,topology:'preserved' as const,segments,dimensions,tolerance};
  }
  throw new OffsetCalculationError('APPROXIMATION_TOPOLOGY_REQUIRES_REFINEMENT');
}
