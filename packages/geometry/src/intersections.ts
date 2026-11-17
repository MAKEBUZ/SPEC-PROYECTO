import { rational as q, fromNumber, compare, add, subtract, multiply, divide, orientation } from './numeric.js';
import type { Rational } from './numeric.js';
import type { Coordinate, Contour } from './model.js';
import { analyzeContour, segmentControls, controlBounds } from './contour-validation.js';
import { rationals as Q, trim, derivative, evaluate, gcd, isolateRoots, RootField, resultant, polynomialAdd, polynomialSubtract, polynomialMultiply, scale } from './polynomials.js';
import type { Root, OrderedField, Polynomial } from './polynomials.js';

export type IntersectionKind='crossing'|'tangent'|'contact';
export interface Parameter { lower:Rational; upper:Rational; endpoint:0|1|null }
export interface Intersection { kind:IntersectionKind; a:Parameter; b:Parameter }
export interface Intersections { overlap:boolean; events:Intersection[] }
type Power={x:Rational[];y:Rational[]};
type Extension=Rational[];
type DoubleExtension=Extension[];
type PairContext={K:RootField<Rational>;L:RootField<Extension>;t:DoubleExtension;u:DoubleExtension;tr:Root<Extension>;ur:Root};
export class IntersectionError extends Error {
  constructor(readonly code:string){super(`No se pudo completar la intersección: ${code}`);this.name='IntersectionError';}
}
const ZERO=q(0n),ONE=q(1n);
export function curvePolynomials(controls:readonly Coordinate[]):Power {
  controlBounds(controls); // validates degree and finite coordinates
  const coordinate=(axis:'x'|'y')=>{
    const c=controls.map(p=>fromNumber(p[axis]));
    if(c.length===2)return trim([c[0]!,subtract(c[1]!,c[0]!)],Q);
    return trim([c[0]!,multiply(q(3n),subtract(c[1]!,c[0]!)),multiply(q(3n),add(subtract(c[2]!,multiply(q(2n),c[1]!)),c[0]!)),add(subtract(c[3]!,multiply(q(3n),c[2]!)),subtract(multiply(q(3n),c[1]!),c[0]!))],Q);
  };
  return {x:coordinate('x'),y:coordinate('y')};
}
function lift<E>(p:Polynomial<Rational>,f:OrderedField<E>):E[]{return p.map(c=>f.fromRational(c));}
function value<E>(p:Polynomial<Rational>,t:E,f:OrderedField<E>):E{return evaluate(lift(p,f),t,f);}
function certificate<E>(r:Root<E>,v:E[],f:RootField<E>):Parameter {
  return {lower:r.lower,upper:r.upper,endpoint:f.sign(v)===0?0:f.sign(f.sub(v,f.one))===0?1:null};
}
function fixed(t:Rational):Parameter{return {lower:t,upper:t,endpoint:compare(t,ZERO)===0?0:compare(t,ONE)===0?1:null};}
function equations(a:Power,b:Power):[Rational[][],Rational[][]] {
  const eq=(p:Rational[],r:Rational[])=>[polynomialSubtract([p[0]??ZERO],r,Q),...p.slice(1).map(c=>[c])];
  return [eq(a.x,b.x),eq(a.y,b.y)];
}
/** Solve a zero-dimensional system by projection, then exact polynomial GCD in
 * each real algebraic fibre. This rejects extraneous resultant roots. */
function solve(f:Rational[][],g:Rational[][],visit:(c:PairContext)=>void,tlo=ZERO,thi=ONE,ulo=ZERO,uhi=ONE):void {
  const projection=resultant(f,g);
  if(!projection.length)throw new IntersectionError('COMMON_COMPONENT');
  for(const ur of isolateRoots(projection,ulo,uhi,Q)) {
    const K=new RootField(Q,ur),u=K.generator;
    const fibre=(p:Rational[][])=>p.map(c=>value(c,u,K));
    const h=gcd(fibre(f),fibre(g),K);
    if(!h.length)throw new IntersectionError('NON_FINITE_FIBRE');
    for(const tr of isolateRoots(h,tlo,thi,K)) {
      const L=new RootField(K,tr);
      visit({K,L,t:L.generator,u:L.constant(u),tr,ur});
    }
  }
}
function seriesMultiply<E>(a:E[],b:E[],n:number,f:OrderedField<E>):E[]{return polynomialMultiply(a,b,f).slice(0,n+1);}
function composeSeries<E>(p:E[],s:E[],n:number,f:OrderedField<E>):E[]{
  let out:E[]=[];for(let i=p.length-1;i>=0;i--)out=polynomialAdd(seriesMultiply(out,s,n,f),[p[i]!],f);return out;
}
function taylor<E>(p:Rational[],at:E,f:OrderedField<E>):E[]{
  const out:E[]=[];let d=p,factor=1n;for(let n=0;d.length;n++){if(n)factor*=BigInt(n);out.push(f.div(value(d,at,f),f.fromRational(q(factor))));d=derivative(d,Q);}return out;
}
function classify(a:Power,b:Power,c:PairContext,checkEndpoints=true):IntersectionKind {
  const {L,t,u}=c;
  const at=certificate(c.tr,t,L),bu=certificate(c.ur,c.K.generator,c.K);
  if(checkEndpoints&&(at.endpoint!==null||bu.endpoint!==null))return 'contact';
  const ax=value(derivative(a.x,Q),t,L),ay=value(derivative(a.y,Q),t,L),bx=value(derivative(b.x,Q),u,L),by=value(derivative(b.y,Q),u,L);
  if(L.sign(L.sub(L.mul(ax,by),L.mul(ay,bx)))!==0)return 'crossing';
  // Compare local branches as power series. Odd contact order crosses; even
  // order touches. Cubic/cubic isolated intersections have order at most nine.
  let ap=a,bp=b,ta=t,tb=u;
  if(L.sign(bx)===0&&L.sign(by)===0){
    if(L.sign(ax)===0&&L.sign(ay)===0)return 'contact'; // singular contact remains a blocking defect
    [ap,bp,ta,tb]=[b,a,u,t];
  }
  const axis=L.sign(value(derivative(bp.x,Q),tb,L))!==0?'x':'y',other=axis==='x'?'y':'x';
  const aa=taylor(ap[axis],ta,L),bb=taylor(bp[axis],tb,L),ao=taylor(ap[other],ta,L),bo=taylor(bp[other],tb,L);
  const s:DoubleExtension[]=[L.zero];
  for(let n=1;n<=9;n++) {
    const current=composeSeries(bb,s,n,L)[n]??L.zero;
    s[n]=L.div(L.sub(aa[n]??L.zero,current),bb[1]!);
    const residual=L.sub(ao[n]??L.zero,composeSeries(bo,s,n,L)[n]??L.zero);
    if(L.sign(residual)!==0)return n%2?'crossing':'tangent';
  }
  throw new IntersectionError('UNRESOLVED_CONTACT_ORDER');
}
function event(a:Power,b:Power,c:PairContext):Intersection{return {kind:classify(a,b,c),a:certificate(c.tr,c.t,c.L),b:certificate(c.ur,c.K.generator,c.K)};}
function divided(p:Rational[]):Rational[][] {
  return Array.from({length:Math.max(0,p.length-1)},(_,i)=>p.slice(i+1));
}
function selfSolve(a:Power,visit:(c:PairContext)=>void,tlo=ZERO,thi=ONE,ulo=ZERO,uhi=ONE):void {
  solve(divided(a.x),divided(a.y),c=>{if(c.L.sign(c.L.sub(c.t,c.u))!==0)visit(c);},tlo,thi,ulo,uhi);
}
type AlgebraicValue={root:Root;expression:Rational[]};
function compareValues(a:AlgebraicValue,b:AlgebraicValue):number {
  const K=new RootField(Q,a.root),av=value(a.expression,K.generator,K);
  const br:Root<Extension>={...b.root,polynomial:b.root.polynomial.map(c=>K.fromRational(c))};
  const L=new RootField(K,br);
  return L.sign(L.sub(L.constant(av),value(b.expression,L.generator,L)));
}
function range(p:Rational[]):{min:AlgebraicValue;max:AlgebraicValue} {
  const endpoint=(t:Rational):Root=>({polynomial:[subtract(ZERO,t),ONE],lower:t,upper:t,multiplicity:1});
  const d=derivative(p,Q),roots=[endpoint(ZERO),endpoint(ONE),...(d.length?isolateRoots(d,ZERO,ONE,Q):[])];
  const candidates=roots.map(root=>({root,expression:p}));let min=candidates[0]!,max=min;
  for(const candidate of candidates.slice(1)){if(compareValues(candidate,min)<0)min=candidate;if(compareValues(candidate,max)>0)max=candidate;}
  return {min,max};
}
function collinear(a:readonly Coordinate[],b:readonly Coordinate[]):boolean {
  const all=[...a,...b],first=all[0]!,second=all.find(p=>p.x!==first.x||p.y!==first.y);
  return !second||all.every(p=>orientation(first,second,p)===0);
}
function linePair(a:Power,b:Power):Intersections {
  const axis=a.x.length>1||b.x.length>1?'x':'y',ar=range(a[axis]),br=range(b[axis]);
  if(compareValues(ar.max,br.min)<0||compareValues(br.max,ar.min)<0)return {overlap:false,events:[]};
  if(compareValues(ar.max,br.min)>0&&compareValues(br.max,ar.min)>0)return {overlap:true,events:[]};
  const av=compareValues(ar.max,br.min)===0?ar.max:ar.min;
  const K=new RootField(Q,av.root),v=value(av.expression,K.generator,K);
  const parameters=(p:Rational[])=>isolateRoots(polynomialSubtract(lift(p,K),[v],K),ZERO,ONE,K).map(r=>{const L=new RootField(K,r);return certificate(r,L.generator,L);});
  const aa=parameters(a[axis]),bb=parameters(b[axis]);
  return {overlap:false,events:aa.flatMap(a=>bb.map(b=>({kind:'contact' as const,a,b})))};
}
function compose(p:Rational[],alpha:Rational,beta:Rational):Rational[]{
  let out:Rational[]=[];for(let i=p.length-1;i>=0;i--)out=polynomialAdd(polynomialMultiply(out,[beta,alpha],Q),[p[i]!],Q);return out;
}
/** Nonlinear polynomial parametrizations of degree <=3 on the same component
 * differ by an affine parameter change. Verify the identity before using it. */
export function affine(a:Power,b:Power):{alpha:Rational;beta:Rational} {
  const n=Math.max(a.x.length,a.y.length)-1;
  const axis=a.x.length===n+1?'x':'y',other=axis==='x'?'y':'x',p=a[axis],r=b[axis];
  const ratio=divide(a[other][n]??ZERO,p[n]!);
  const lower=polynomialSubtract(a[other],scale(p,ratio,Q),Q),target=polynomialSubtract(b[other],scale(r,ratio,Q),Q);
  let alpha:Rational,beta:Rational;
  if(lower.length===2){alpha=divide(target[1]??ZERO,lower[1]!);beta=divide(subtract(target[0]??ZERO,lower[0]??ZERO),lower[1]!);}
  else if(n===3&&lower.length===3){alpha=divide(divide(r[3]??ZERO,p[3]!),divide(target[2]??ZERO,lower[2]!));beta=divide(subtract(divide(r[2]??ZERO,multiply(alpha,alpha)),p[2]??ZERO),multiply(q(3n),p[3]!));}
  else throw new IntersectionError('UNRESOLVED_COMMON_COMPONENT');
  if(compare(alpha,ZERO)===0||(['x','y'] as const).some(axis=>polynomialSubtract(compose(a[axis],alpha,beta),b[axis],Q).length))throw new IntersectionError('UNRESOLVED_COMMON_COMPONENT');
  return {alpha,beta};
}
function shared(a:Power,b:Power):Intersections {
  const {alpha,beta}=affine(a,b),end=add(alpha,beta),lo=compare(beta,end)<0?beta:end,hi=compare(beta,end)<0?end:beta;
  const left=compare(lo,ZERO)>0?lo:ZERO,right=compare(hi,ONE)<0?hi:ONE;
  if(compare(left,right)<0)return {overlap:true,events:[]};
  const events:Intersection[]=[];
  if(compare(left,right)===0)events.push({kind:'contact',a:fixed(left),b:fixed(divide(subtract(left,beta),alpha))});
  selfSolve(a,c=>{
    const bparam=c.L.div(c.L.sub(c.u,c.L.fromRational(beta)),c.L.fromRational(alpha));
    const lower=divide(subtract(c.ur.lower,beta),alpha),upper=divide(subtract(c.ur.upper,beta),alpha);
    const ap=certificate(c.tr,c.t,c.L),bp:Parameter={lower:compare(lower,upper)<0?lower:upper,upper:compare(lower,upper)<0?upper:lower,endpoint:c.L.sign(bparam)===0?0:c.L.sign(c.L.sub(bparam,c.L.one))===0?1:null};
    events.push({kind:ap.endpoint!==null||bp.endpoint!==null?'contact':classify(a,a,c,false),a:ap,b:bp});
  },ZERO,ONE,lo,hi);
  return {overlap:false,events};
}
export function intersectCurves(ac:readonly Coordinate[],bc:readonly Coordinate[]):Intersections {
  const a=curvePolynomials(ac),b=curvePolynomials(bc);
  const ab=controlBounds(ac),bb=controlBounds(bc);
  if(ab.maxX<bb.minX||bb.maxX<ab.minX||ab.maxY<bb.minY||bb.maxY<ab.minY)return {overlap:false,events:[]};
  // A constant curve against a nonlinear one: solve both coordinates together.
  if(Math.max(a.x.length,a.y.length)<=1||Math.max(b.x.length,b.y.length)<=1){
    const swap=Math.max(b.x.length,b.y.length)<=1,p=swap?b:a,r=swap?a:b;
    const h=gcd(polynomialSubtract(r.x,p.x,Q),polynomialSubtract(r.y,p.y,Q),Q);
    if(!h.length)return {overlap:false,events:[{kind:'contact',a:fixed(ZERO),b:fixed(ZERO)}]};
    return {overlap:false,events:isolateRoots(h,ZERO,ONE,Q).map(root=>{const K=new RootField(Q,root),parameter=certificate(root,K.generator,K);return {kind:'contact',a:swap?parameter:fixed(ZERO),b:swap?fixed(ZERO):parameter};})};
  }
  if(collinear(ac,bc))return linePair(a,b);
  const [f,g]=equations(a,b);
  if(!resultant(f,g).length)return shared(a,b);
  const events:Intersection[]=[];solve(f,g,c=>events.push(event(a,b,c)));
  return {overlap:false,events};
}
export function selfIntersections(controls:readonly Coordinate[]):Intersections {
  const a=curvePolynomials(controls);
  if(collinear(controls,controls)){
    const p=a.x.length>1?a.x:a.y,d=derivative(p,Q);
    if(!d.length)return {overlap:false,events:[]};
    const roots=isolateRoots(d,ZERO,ONE,Q);
    return {overlap:roots.some(r=>{const K=new RootField(Q,r);return r.multiplicity%2===1&&K.sign(K.generator)>0&&K.sign(K.sub(K.generator,K.one))<0;}),events:[]};
  }
  const events:Intersection[]=[];selfSolve(a,c=>{if(c.L.sign(c.L.sub(c.t,c.u))<0)events.push(event(a,a,c));});
  return {overlap:false,events};
}
export function classifyPair(a:readonly Coordinate[],b:readonly Coordinate[]):{kind:string;count?:number} {
  const result=intersectCurves(a,b);if(result.overlap)return {kind:'overlap'};
  const kinds=result.events.map(e=>e.kind);
  return {kind:kinds.includes('crossing')?'crossing':kinds.includes('contact')?'contact':kinds.includes('tangent')?'tangent':'none',count:kinds.length};
}
export function inspectContour(contour:Contour):{closed:boolean;defects:string[]} {
  const analysis=analyzeContour(contour),defects=new Set<string>();
  if(!analysis.closed)defects.add('open');
  if(analysis.constantSegmentIds.length)defects.add('zero-length');
  if(analysis.signedArea&&compare(analysis.signedArea,ZERO)===0)defects.add('zero-area');
  const controls=contour.segments.map(s=>segmentControls(contour,s.id));
  // analyzeContour has validated finite stored coordinates. A Bézier is
  // contained in its control hull, so strict box separation is exact here.
  const boxes=controls.map(controlBounds);
  for(let i=0;i<controls.length;i++){
    const self=selfIntersections(controls[i]!);if(self.overlap)defects.add('overlap');
    self.events.forEach(e=>{
      const segment=contour.segments[i]!;
      if(!(segment.startId===segment.endId&&e.a.endpoint===0&&e.b.endpoint===1))defects.add(e.kind);
    });
    for(let j=i+1;j<controls.length;j++){
      const aBox=boxes[i]!,bBox=boxes[j]!;
      if(aBox.maxX<bBox.minX||bBox.maxX<aBox.minX||aBox.maxY<bBox.minY||bBox.maxY<aBox.minY)continue;
      const result=intersectCurves(controls[i]!,controls[j]!);if(result.overlap)defects.add('overlap');
      for(const e of result.events){
        const a=contour.segments[i]!,b=contour.segments[j]!;
        const normal=(j===i+1&&a.endId===b.startId&&e.a.endpoint===1&&e.b.endpoint===0)||(i===0&&j===controls.length-1&&b.endId===a.startId&&e.a.endpoint===0&&e.b.endpoint===1);
        if(!normal)defects.add(e.kind);
      }
    }
  }
  return {closed:analysis.closed,defects:[...defects]};
}
