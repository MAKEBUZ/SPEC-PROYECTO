import type {AlgebraicContext,Exact} from '../../geometry/src/algebraic.js';
import type {MarginPrimitive} from '../../geometry/src/curved-margin.js';
import {tangentPolynomials} from '../../geometry/src/offset-intersections.js';
import {vector,type ExactPoint} from '../../geometry/src/derived-path.js';
import {polynomialAdd as add,polynomialMultiply as mul,scale,derivative,evaluate} from '../../geometry/src/polynomials.js';
import {bivariate,radicalNonnegative,type Bi} from '../../geometry/src/radical-sign.js';
import {nonnegativeOnUnitSquare} from '../../geometry/src/bivariate-sign.js';
import {primitiveDistanceSquared} from './path-separation.js';
type Power={x:Exact[];y:Exact[]};
/** P + V/sqrt(S), with strictly positive S and parameter in [0,1]. */
function expression(f:AlgebraicContext,e:MarginPrimitive,move:(p:ExactPoint)=>ExactPoint){
 let p:Power,v:Power,s:Exact[];
 if(e.kind==='line'){
  const a={x:f.import(e.start.x),y:f.import(e.start.y)},b={x:f.import(e.end.x),y:f.import(e.end.y)};
  p={x:[a.x,f.sub(b.x,a.x)],y:[a.y,f.sub(b.y,a.y)]};v={x:[],y:[]};s=[f.one];
 }else if(e.kind==='arc'){
  const c={x:f.import(e.center.x),y:f.import(e.center.y)},a=vector(f,{x:f.import(e.start.x),y:f.import(e.start.y)},c),b=vector(f,{x:f.import(e.end.x),y:f.import(e.end.y)},c);
  const x=[a.x,f.sub(b.x,a.x)],y=[a.y,f.sub(b.y,a.y)],r=f.import(e.radius);
  p={x:[c.x],y:[c.y]};v={x:scale(x,r,f),y:scale(y,r,f)};s=add(mul(x,x,f),mul(y,y,f),f);
 }else{
  const raw=tangentPolynomials(e.curve),from=f.import(e.from),to=f.import(e.to),span=f.sub(to,from),at=[from,span];
  const compose=(poly:Exact[])=>{let out:Exact[]=[];for(let i=poly.length-1;i>=0;i--)out=add(mul(out,at,f),[poly[i]!],f);return out;};
  const lift=(poly:typeof raw.x)=>poly.map(c=>f.fromRational(c));
  p={x:compose(lift(raw.p.x)),y:compose(lift(raw.p.y))};
  if(e.curve.width===0){v={x:[],y:[]};s=[f.one];}
  else{
   for(const root of f.roots(lift(raw.common)))if(f.compare(root,from)>0&&f.compare(root,to)<0){
    let d=lift(raw.common),order=0;while(d.length&&!f.sign(evaluate(d,root,f))){d=derivative(d,f);order++;}
    if(order%2)throw Error('DISTANCE_NORMAL_BRANCH_NOT_VALIDATED');
   }
   const middle=f.div(f.add(from,to),f.number(2));let common=lift(raw.common),sign=f.sign(evaluate(common,middle,f));
   while(!sign&&common.length){common=derivative(common,f);sign=f.sign(evaluate(common,middle,f));}
   // Validated offset paths have one continuous normal branch; an even
   // stationary factor is removed without making S vanish.
   const width=f.number(e.curve.width*e.curve.winding*sign*raw.initialSign),x=compose(lift(raw.x)),y=compose(lift(raw.y));
   v={x:scale(y,width,f),y:scale(x,f.sub(f.zero,width),f)};s=add(mul(x,x,f),mul(y,y,f),f);
  }
 }
 const origin=move({x:f.zero,y:f.zero}),ex=vector(f,move({x:f.one,y:f.zero}),origin),ey=vector(f,move({x:f.zero,y:f.one}),origin);
 const rotate=(q:Power):Power=>({x:add(scale(q.x,ex.x,f),scale(q.y,ey.x,f),f),y:add(scale(q.x,ex.y,f),scale(q.y,ey.y,f),f)});
 p=rotate(p);p={x:add(p.x,[origin.x],f),y:add(p.y,[origin.y],f)};v=rotate(v);
 if(s.length===1){const divisor=f.sqrt(s[0]!);if(!f.sign(divisor))throw Error('DISTANCE_RADICAL_NOT_POSITIVE');p={x:add(p.x,scale(v.x,f.div(f.one,divisor),f),f),y:add(p.y,scale(v.y,f.div(f.one,divisor),f),f)};v={x:[],y:[]};s=[f.one];}
 return {p,v,s,error:!v.x.length&&!v.y.length?f.zero:e.kind==='arc'?f.import(e.radius):e.kind==='offset'?f.number(e.curve.width):f.zero};
}
/** Full parameter-domain distance decision; no separating support required.
 * Inputs are already validated outer-boundary primitives. */
export function primitiveSeparation(f:AlgebraicContext,a:MarginPrimitive,ma:(p:ExactPoint)=>ExactPoint,b:MarginPrimitive,mb:(p:ExactPoint)=>ExactPoint):'valid'|'too-close'{
 if(a.kind!=='offset'&&b.kind!=='offset'){
  const aa=a.kind==='line'?{...a,start:ma(a.start),end:ma(a.end)}:{...a,start:ma(a.start),end:ma(a.end),center:ma(a.center),radius:f.import(a.radius)};
  const bb=b.kind==='line'?{...b,start:mb(b.start),end:mb(b.end)}:{...b,start:mb(b.start),end:mb(b.end),center:mb(b.center),radius:f.import(b.radius)};
  return f.compare(primitiveDistanceSquared(f,aa,bb),f.number(4))>=0?'valid':'too-close';
 }
 const x=expression(f,a,ma),y=expression(f,b,mb),p=bivariate(f),left=(v:Exact[]):Bi=>v.map(c=>[c]),right=(v:Exact[]):Bi=>[v];
 const point=(e:typeof x,t:Exact)=>{const d=f.sqrt(evaluate(e.s,t,f));if(!f.sign(d))throw Error('DISTANCE_RADICAL_NOT_POSITIVE');return {x:f.add(evaluate(e.p.x,t,f),f.div(evaluate(e.v.x,t,f),d)),y:f.add(evaluate(e.p.y,t,f),f.div(evaluate(e.v.y,t,f),d))};};
 // These are counterexample witnesses only; no sampling can approve a pair.
 for(const t of [f.zero,f.number(.5),f.one])for(const u of [f.zero,f.number(.5),f.one]){const aa=point(x,t),bb=point(y,u);if(f.compare(f.add(f.square(f.sub(aa.x,bb.x)),f.square(f.sub(aa.y,bb.y))),f.number(4))<0)return 'too-close';}
 const dx=p.sub(left(x.p.x),right(y.p.x)),dy=p.sub(left(x.p.y),right(y.p.y)),ax=left(x.v.x),ay=left(x.v.y),bx=right(y.v.x),by=right(y.v.y),S=left(x.s),T=right(y.s);
 const dot=(a:Bi,b:Bi,c:Bi,d:Bi)=>p.add(p.mul(a,c),p.mul(b,d));
 const threshold=f.add(f.number(2),f.add(x.error,y.error));
 // Triangle inequality is sufficient even for a positive margin. It does
 // not declare insufficient separation if the bound cannot prove it.
 if(nonnegativeOnUnitSquare(f,p.sub(dot(dx,dy,dx,dy),[[f.square(threshold)]])))return 'valid';
 const R=p.add(p.mul(p.sub(dot(dx,dy,dx,dy),[[f.number(4)]]),p.mul(S,T)),p.add(p.mul(dot(ax,ay,ax,ay),T),p.mul(dot(bx,by,bx,by),S)));
 const A=p.scale(p.mul(dot(dx,dy,ax,ay),T),2),B=p.scale(p.mul(dot(dx,dy,bx,by),S),-2),C=p.scale(dot(ax,ay,bx,by),-2);
 return radicalNonnegative(f,R,A,B,C,S,T)?'valid':'too-close';
}
