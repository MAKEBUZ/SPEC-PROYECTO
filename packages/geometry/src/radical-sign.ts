import type {AlgebraicContext,Exact} from './algebraic.js';
import {polynomialAdd,polynomialMultiply,scale,evaluate,trim} from './polynomials.js';
import {everySignCell,nonnegativeOnUnitSquare} from './bivariate-sign.js';
export type Bi=Exact[][];
export function bivariate(f:AlgebraicContext){
 const clean=(p:Bi)=>{const q=p.map(row=>trim(row,f));while(q.length&&!q.at(-1)!.length)q.pop();return q;};
 const add=(a:Bi,b:Bi)=>clean(Array.from({length:Math.max(a.length,b.length)},(_,i)=>polynomialAdd(a[i]??[],b[i]??[],f)));
 const times=(a:Bi,b:Bi)=>{if(!a.length||!b.length)return [];const out:Bi=Array.from({length:a.length+b.length-1},()=>[]);a.forEach((x,i)=>b.forEach((y,j)=>{out[i+j]=polynomialAdd(out[i+j]!,polynomialMultiply(x,y,f),f);}));return clean(out);};
 const scaled=(a:Bi,n:number)=>clean(a.map(row=>scale(row,f.number(n),f)));
 return {clean,add,mul:times,sub:(a:Bi,b:Bi)=>add(a,scaled(b,-1)),scale:scaled,square:(p:Bi)=>times(p,p),at:(p:Bi,t:Exact,u:Exact)=>evaluate(p.map(row=>evaluate(row,u,f)),t,f)};
}
/** Decide R + A sqrt(S) + B sqrt(T) + C sqrt(S T) >= 0.
 * S,T must be strictly positive. The norm supplies zero sections; conjugate
 * collision loci and coefficients preserve branch identity even when the
 * norm vanishes identically or a conjugate is repeated. Squaring alone never
 * decides the sign: evaluate the original positive-radical branch per cell. */
export function radicalNonnegative(f:AlgebraicContext,R:Bi,A:Bi,B:Bi,C:Bi,S:Bi,T:Bi):boolean{
 const p=bivariate(f);if(!A.length&&!B.length&&!C.length)return nonnegativeOnUnitSquare(f,R);
 if([R,A,B,C].every(poly=>nonnegativeOnUnitSquare(f,poly)))return true;
 const E=p.sub(p.add(p.square(R),p.mul(p.square(A),S)),p.mul(T,p.add(p.square(B),p.mul(p.square(C),S))));
 const F=p.scale(p.sub(p.mul(R,A),p.mul(T,p.mul(B,C))),2);
 const norm=p.sub(p.square(E),p.mul(p.square(F),S));
 const collisions=[p.sub(p.square(A),p.mul(p.square(C),T)),p.sub(p.square(B),p.mul(p.square(C),S)),p.sub(p.mul(p.square(A),S),p.mul(p.square(B),T))];
 return everySignCell(f,[norm,...collisions,R,A,B,C,S,T],(t,u)=>{
  const s=p.at(S,t,u),v=p.at(T,t,u);if(f.sign(s)<=0||f.sign(v)<=0)throw Error('DISTANCE_RADICAL_NOT_POSITIVE');
  const rs=f.sqrt(s),rt=f.sqrt(v);
  return f.sign(f.add(f.add(p.at(R,t,u),f.mul(p.at(A,t,u),rs)),f.add(f.mul(p.at(B,t,u),rt),f.mul(p.at(C,t,u),f.mul(rs,rt)))))>=0;
 });
}
