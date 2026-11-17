import {AlgebraicContext,type Exact} from '../../geometry/src/algebraic.js';
import {algebraicResultant} from '../../geometry/src/algebraic-elimination.js';
import {derivative,evaluate,polynomialAdd as add,polynomialSubtract as sub,polynomialMultiply as mul,scale,gcd} from '../../geometry/src/polynomials.js';
import {segmentControls} from '../../geometry/src/contour-validation.js';
import {curvePolynomials} from '../../geometry/src/intersections.js';
import {validateOffset} from '../../geometry/src/offset.js';
import {offsetCriticalParameters,evaluateDerivedOffset} from '../../geometry/src/offset-intersections.js';
import {onArc,dot,vector,advance,type ExactPoint} from '../../geometry/src/derived-path.js';
import type {MarginPrimitive} from '../../geometry/src/curved-margin.js';
import type {Piece} from '../../document/src/piece.js';
import type {PrintTransform} from '../../document/src/preparation.js';
import {placement} from './placement.js';
import {primitiveSeparation} from './primitive-separation.js';
type Power={sourceId:string;x:Exact[];y:Exact[]};
function worldCurves(f:AlgebraicContext,p:Piece,move:(p:ExactPoint)=>ExactPoint):Power[]{
 const origin=move({x:f.zero,y:f.zero}),ex=vector(f,move({x:f.one,y:f.zero}),origin),ey=vector(f,move({x:f.zero,y:f.one}),origin);
 return p.contour.segments.map(s=>{const raw=curvePolynomials(segmentControls(p.contour,s.id)),x=raw.x.map(q=>f.fromRational(q)),y=raw.y.map(q=>f.fromRational(q));return {sourceId:s.id,x:add(add(scale(x,ex.x,f),scale(y,ey.x,f),f),[origin.x],f),y:add(add(scale(x,ex.y,f),scale(y,ey.y,f),f),[origin.y],f)};});
}
function paths(f:AlgebraicContext,p:Piece):MarginPrimitive[]{
 const margin=validateOffset({...p,seamWidth:p.seamWidth??0});
 if(margin.kind==='validated')return margin.path;
 if(margin.kind!=='validated-coincident')throw Error('ALGEBRAIC_SEPARATION_INVALID_MARGIN');
 return p.contour.segments.map(s=>{const controls=segmentControls(p.contour,s.id),start={x:f.number(controls[0]!.x),y:f.number(controls[0]!.y)},end={x:f.number(controls.at(-1)!.x),y:f.number(controls.at(-1)!.y)};
  return s.kind==='line'?{kind:'line',sourceId:s.id,start,end}:{kind:'offset',sourceId:s.id,start,end,from:f.zero,to:f.one,curve:{controls,width:0,winding:1}};
 });
}
function range(f:AlgebraicContext,path:MarginPrimitive[],move:(p:ExactPoint)=>ExactPoint,axis:ExactPoint){
 const origin=move({x:f.zero,y:f.zero}),direction={x:dot(f,axis,vector(f,move({x:f.one,y:f.zero}),origin)),y:dot(f,axis,vector(f,move({x:f.zero,y:f.one}),origin))};
 const points=path.flatMap(e=>{
  const endpoints=[e.start,e.end];
  if(e.kind==='offset'){
   const from=f.import(e.from),to=f.import(e.to);
   return [...endpoints,...offsetCriticalParameters(f,e.curve,[direction]).filter(t=>f.compare(t,from)>0&&f.compare(t,to)<0).map(t=>evaluateDerivedOffset(f,e.curve,t))];
  }
  if(e.kind==='arc'){
   const arc={...e,start:{x:f.import(e.start.x),y:f.import(e.start.y)},end:{x:f.import(e.end.x),y:f.import(e.end.y)},center:{x:f.import(e.center.x),y:f.import(e.center.y)},radius:f.import(e.radius)};
   const t=f.div(arc.radius,f.sqrt(dot(f,direction,direction)));
   return [...endpoints,...[1,-1].map(sign=>advance(f,arc.center,direction,f.mul(t,f.number(sign)))).filter(point=>onArc(f,arc,point))];
  }return endpoints;
 }).map(p=>dot(f,axis,move(p)));
 return {min:points.reduce((a,b)=>f.compare(a,b)<0?a:b),max:points.reduce((a,b)=>f.compare(a,b)>0?a:b)};
}
/** A sufficient, exact separating-support certificate. With sources, `valid`
 * certifies only those complete source paths, not the pieces or containment.
 * Failure to find a support is unresolved, never geometric invalidity. */
export function algebraicSeparation(a:Piece,ta:PrintTransform,b:Piece,tb:PrintTransform,sources?:readonly [string,string]):'valid'|'too-close'|'unresolved'{
 const f=new AlgebraicContext(),ma=placement(f,ta),mb=placement(f,tb);
 // A source may own several trimmed primitives and corner joins. Include all
 // of them: proving only an untrimmed base segment would not certify a margin.
 const ap=paths(f,a).filter(e=>!sources||e.sourceId===sources[0]),bp=paths(f,b).filter(e=>!sources||e.sourceId===sources[1]);
 if(!ap.length||!bp.length)return 'unresolved';
 const ac=worldCurves(f,a,ma).filter(e=>!sources||e.sourceId===sources[0]),bc=worldCurves(f,b,mb).filter(e=>!sources||e.sourceId===sources[1]);
 const nearLine=(point:ExactPoint,path:MarginPrimitive[],move:(p:ExactPoint)=>ExactPoint)=>path.some(e=>{
  if(e.kind!=='line')return false;
  const start=move(e.start),end=move(e.end),v=vector(f,end,start),length=dot(f,v,v);
  if(!f.sign(length))return f.compare(dot(f,vector(f,point,start),vector(f,point,start)),f.number(4))<0;
  let t=f.div(dot(f,vector(f,point,start),v),length);if(f.sign(t)<0)t=f.zero;if(f.compare(t,f.one)>0)t=f.one;
  const delta=vector(f,point,advance(f,start,v,t));return f.compare(dot(f,delta,delta),f.number(4))<0;
 });
 const check=(axis:ExactPoint)=>{
  const norm=dot(f,axis,axis);if(!f.sign(norm))return false;
  const ar=range(f,ap,ma,axis),br=range(f,bp,mb,axis);
  return [f.sub(br.min,ar.max),f.sub(ar.min,br.max)].some(gap=>f.sign(gap)>0&&f.compare(f.square(gap),f.mul(f.number(4),norm))>=0);
 };
 for(const x of ac)for(const y of bc){
  const dx=derivative(x.x,f),dy=derivative(x.y,f),ux=derivative(y.x,f),uy=derivative(y.y,f);
  // Common normals: A'(t) x B'(u)=0 and (B(u)-A(t)) . A'(t)=0.
  const cross=Array.from({length:Math.max(dx.length,dy.length)},(_,i)=>sub(scale(uy,dx[i]??f.zero,f),scale(ux,dy[i]??f.zero,f),f));
  const tangentDot=add(mul(x.x,dx,f),mul(x.y,dy,f),f);
  const normal=Array.from({length:Math.max(dx.length,dy.length,tangentDot.length)},(_,i)=>sub(add(scale(y.x,dx[i]??f.zero,f),scale(y.y,dy[i]??f.zero,f),f),[tangentDot[i]??f.zero],f));
  const projection=algebraicResultant(cross,normal,f);
  if(projection.length){for(const u of f.roots(projection)){
   const first=cross.map(row=>evaluate(row,u,f)),second=normal.map(row=>evaluate(row,u,f)),common=gcd(first,second,f);
   if(common.length<2)continue;
   for(const t of f.roots(common)){
    const aa=ap.find(e=>e.sourceId===x.sourceId&&e.kind==='offset'),bb=bp.find(e=>e.sourceId===y.sourceId&&e.kind==='offset');
    if(aa?.kind==='offset'&&f.compare(t,f.import(aa.from))>=0&&f.compare(t,f.import(aa.to))<=0&&nearLine(ma(evaluateDerivedOffset(f,aa.curve,t)),bp,mb))return 'too-close';
    if(bb?.kind==='offset'&&f.compare(u,f.import(bb.from))>=0&&f.compare(u,f.import(bb.to))<=0&&nearLine(mb(evaluateDerivedOffset(f,bb.curve,u)),ap,ma))return 'too-close';
    if(aa?.kind==='offset'&&bb?.kind==='offset'&&f.compare(t,f.import(aa.from))>=0&&f.compare(t,f.import(aa.to))<=0&&f.compare(u,f.import(bb.from))>=0&&f.compare(u,f.import(bb.to))<=0){
     const delta=vector(f,ma(evaluateDerivedOffset(f,aa.curve,t)),mb(evaluateDerivedOffset(f,bb.curve,u)));
     // A genuine point pair closer than 2 disproves any separating support.
     if(f.compare(dot(f,delta,delta),f.number(4))<0)return 'too-close';
    }
    const axis={x:f.sub(f.zero,evaluate(dy,t,f)),y:evaluate(dx,t,f)};if(check(axis))return 'valid';
   }
  }}
 }
 // Endpoint and degenerate parallel-tangent candidates also require the full
 // support proof; none is accepted solely from a local distance or a sample.
 const ae=ap.flatMap(e=>[ma(e.start),ma(e.end)]),be=bp.flatMap(e=>[mb(e.start),mb(e.end)]);
 for(const x of ae)for(const y of be)if(check(vector(f,y,x)))return 'valid';
 for(const curve of [...ac,...bc]){const dx=derivative(curve.x,f),dy=derivative(curve.y,f);for(const t of [f.zero,f.number(.5),f.one])if(check({x:f.sub(f.zero,evaluate(dy,t,f)),y:evaluate(dx,t,f)}))return 'valid';}
 // A source-scoped result concerns boundary distance only; the caller still
 // checks disjoint certified tubes and containment. Never use this approval
 // for whole pieces without that containment check.
 if(sources){for(const x of ap)for(const y of bp){const exact=new AlgebraicContext();if(primitiveSeparation(exact,x,placement(exact,ta),y,placement(exact,tb))==='too-close')return 'too-close';}return 'valid';}
 return 'unresolved';
}

