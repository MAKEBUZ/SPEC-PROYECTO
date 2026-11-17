import { rational, add, subtract, multiply, divide, compare } from './numeric.js';
import type { Rational, Sign } from './numeric.js';

export interface OrderedField<E> {
  readonly rationalBase?:true;
  zero:E; one:E; fromRational(q:Rational):E;
  add(a:E,b:E):E; sub(a:E,b:E):E; mul(a:E,b:E):E; div(a:E,b:E):E; sign(a:E):Sign;
}
export const rationals:OrderedField<Rational>={rationalBase:true,zero:rational(0n),one:rational(1n),fromRational:q=>q,add,sub:subtract,mul:multiply,div:divide,sign:a=>compare(a,rational(0n))};
export type Polynomial<E=Rational> = readonly E[]; // ascending powers; [] is zero
export class PolynomialError extends Error {
  constructor(readonly code:'ZERO_POLYNOMIAL'|'ZERO_DIVISOR'|'INEXACT_DIVISION'|'INVALID_ROOT_INTERVAL'|'RESULTANT_DEGREE_UNSUPPORTED') { super(`No se pudo completar el cálculo polinómico: ${code}`); this.name='PolynomialError'; }
}
export function trim<E>(p:Polynomial<E>,f:OrderedField<E>):E[] { let n=p.length; while(n&&f.sign(p[n-1]!)===0)n--; return p.slice(0,n); }
export function polynomialAdd<E>(a:Polynomial<E>,b:Polynomial<E>,f:OrderedField<E>):E[] {
  return trim(Array.from({length:Math.max(a.length,b.length)},(_,i)=>f.add(a[i]??f.zero,b[i]??f.zero)),f);
}
export function scale<E>(a:Polynomial<E>,s:E,f:OrderedField<E>):E[] { return trim(a.map(x=>f.mul(x,s)),f); }
export function polynomialSubtract<E>(a:Polynomial<E>,b:Polynomial<E>,f:OrderedField<E>):E[] { return polynomialAdd(a,scale(b,f.sub(f.zero,f.one),f),f); }
export function polynomialMultiply<E>(a:Polynomial<E>,b:Polynomial<E>,f:OrderedField<E>):E[] {
  if(!a.length||!b.length)return []; const result=Array<E>(a.length+b.length-1).fill(f.zero);
  a.forEach((x,i)=>b.forEach((y,j)=>{result[i+j]=f.add(result[i+j]!,f.mul(x,y));})); return trim(result,f);
}
export function divRem<E>(a:Polynomial<E>,b:Polynomial<E>,f:OrderedField<E>):{quotient:E[];remainder:E[]} {
  let r=trim(a,f); const d=trim(b,f); if(!d.length)throw new PolynomialError('ZERO_DIVISOR');
  const q=Array<E>(Math.max(0,r.length-d.length+1)).fill(f.zero);
  while(r.length>=d.length) { const k=r.length-d.length,c=f.div(r.at(-1)!,d.at(-1)!); q[k]=c; const term=[...Array<E>(k).fill(f.zero),...scale(d,c,f)]; r=polynomialSubtract(r,term,f); }
  return {quotient:trim(q,f),remainder:r};
}
export function exactDivide<E>(a:Polynomial<E>,b:Polynomial<E>,f:OrderedField<E>):E[] {
  const result=divRem(a,b,f); if(result.remainder.length)throw new PolynomialError('INEXACT_DIVISION'); return result.quotient;
}
export function monic<E>(p:Polynomial<E>,f:OrderedField<E>):E[] { const a=trim(p,f); return a.length?scale(a,f.div(f.one,a.at(-1)!),f):[]; }
export function derivative<E>(p:Polynomial<E>,f:OrderedField<E>):E[] { return trim(p.slice(1).map((c,i)=>f.mul(c,f.fromRational(rational(BigInt(i+1))))),f); }
export function evaluate<E>(p:Polynomial<E>,x:E,f:OrderedField<E>):E { let result=f.zero; for(let i=p.length-1;i>=0;i--)result=f.add(f.mul(result,x),p[i]!); return result; }
export function gcd<E>(a:Polynomial<E>,b:Polynomial<E>,f:OrderedField<E>):E[] {
  let x=monic(a,f),y=monic(b,f); while(y.length) { const r=monic(divRem(x,y,f).remainder,f); x=y;y=r; } return monic(x,f);
}
export function squareFree<E>(p:Polynomial<E>,f:OrderedField<E>):E[] {
  const a=trim(p,f); if(!a.length)throw new PolynomialError('ZERO_POLYNOMIAL'); return monic(exactDivide(a,gcd(a,derivative(a,f),f),f),f);
}
export function sturm<E>(p:Polynomial<E>,f:OrderedField<E>):E[][] {
  const a=trim(p,f); if(!a.length)throw new PolynomialError('ZERO_POLYNOMIAL');
  const seq=[a,derivative(a,f)]; if(!seq[1]!.length)return [a];
  while(true) {
    const r=scale(divRem(seq.at(-2)!,seq.at(-1)!,f).remainder,f.sub(f.zero,f.one),f);if(!r.length)break;
    const leading=r.at(-1)!,positive=f.sign(leading)<0?f.sub(f.zero,leading):leading;
    seq.push(scale(r,f.div(f.one,positive),f));
  } return seq;
}
function variations<E>(seq:Polynomial<E>[],x:Rational,f:OrderedField<E>):number {
  let previous:Sign=0,count=0; for(const p of seq) { const s=f.sign(evaluate(p,f.fromRational(x),f)); if(s) {if(previous&&previous!==s)count++; previous=s;} } return count;
}
/** Distinct roots strictly inside (lo,hi). Endpoints are handled separately. */
export function countRoots<E>(p:Polynomial<E>,lo:Rational,hi:Rational,f:OrderedField<E>):number {
  if(compare(lo,hi)>=0)return 0; const a=trim(p,f); if(a.length<2)return 0;
  const distinct=squareFree(a,f),seq=sturm(distinct,f);
  return variations(seq,lo,f)-variations(seq,hi,f)-(f.sign(evaluate(distinct,f.fromRational(hi),f))===0?1:0);
}
export interface Root<E=Rational> { polynomial:E[]; lower:Rational; upper:Rational; multiplicity:number }
export function refineRoot<E>(root:Root<E>,f:OrderedField<E>):void {
  if(compare(root.lower,root.upper)===0)return;
  const mid=divide(add(root.lower,root.upper),rational(2n));
  if(f.sign(evaluate(root.polynomial,f.fromRational(mid),f))===0) {root.lower=mid;root.upper=mid;return;}
  if(countRoots(root.polynomial,root.lower,mid,f))root.upper=mid;else root.lower=mid;
}
function vanishes<E>(root:Root<E>,p:Polynomial<E>,f:OrderedField<E>):boolean {
  if(compare(root.lower,root.upper)===0)return f.sign(evaluate(p,f.fromRational(root.lower),f))===0;
  return countRoots(gcd(root.polynomial,p,f),root.lower,root.upper,f)>0;
}
export function isolateRoots<E>(input:Polynomial<E>,lower:Rational,upper:Rational,f:OrderedField<E>):Root<E>[] {
  if(compare(lower,upper)>0)throw new PolynomialError('INVALID_ROOT_INTERVAL');
  const original=trim(input,f),p=squareFree(original,f),roots:Root<E>[]=[];
  const sequence=sturm(p,f);
  const count=(lo:Rational,hi:Rational)=>compare(lo,hi)>=0?0:variations(sequence,lo,f)-variations(sequence,hi,f)-(f.sign(evaluate(p,f.fromRational(hi),f))===0?1:0);
  const append=(lo:Rational,hi:Rational)=>{ const root:Root<E>={polynomial:p,lower:lo,upper:hi,multiplicity:0}; let d=original; while(d.length&&vanishes(root,d,f)){root.multiplicity++;d=derivative(d,f);} roots.push(root); };
  if(f.sign(evaluate(p,f.fromRational(lower),f))===0)append(lower,lower);
  if(compare(lower,upper)===0)return roots;
  if(f.sign(evaluate(p,f.fromRational(upper),f))===0)append(upper,upper);
  const queue:[Rational,Rational][]=[[lower,upper]];
  while(queue.length) {
    const [lo,hi]=queue.pop()!,number=count(lo,hi); if(!number)continue;
    if(number===1) {append(lo,hi);continue;}
    const mid=divide(add(lo,hi),rational(2n));
    if(f.sign(evaluate(p,f.fromRational(mid),f))===0)append(mid,mid);
    queue.push([mid,hi],[lo,mid]);
  }
  // Refine overlapping certificates so callers can order roots without floats.
  for(let i=0;i<roots.length;i++)for(let j=i+1;j<roots.length;j++) {
    const a=roots[i]!,b=roots[j]!;
    while(compare(a.lower,b.upper)<0&&compare(b.lower,a.upper)<0) {refineRoot(a,f);refineRoot(b,f);}
  }
  return roots.sort((a,b)=>compare(a.lower,b.lower)||compare(a.upper,b.upper));
}

/** Exact ordered extension at one isolated real root. A reducible defining
 * polynomial is split lazily when division requires it; no rational factoring
 * or guessed approximate root is needed. Elements are polynomials in the root.
 */
export class RootField<E> implements OrderedField<E[]> {
  readonly zero:E[]=[]; readonly one:E[]; private modulus:E[];
  constructor(readonly base:OrderedField<E>,readonly root:Root<E>) {this.one=[base.one];this.modulus=monic(root.polynomial,base);}
  fromRational(q:Rational):E[] {return [this.base.fromRational(q)];}
  constant(value:E):E[] {return trim([value],this.base);}
  get generator():E[] {return this.reduce([this.base.zero,this.base.one]);}
  private reduce(p:Polynomial<E>):E[] {
    if(compare(this.root.lower,this.root.upper)===0)return trim([evaluate(p,this.base.fromRational(this.root.lower),this.base)],this.base);
    return divRem(p,this.modulus,this.base).remainder;
  }
  add(a:E[],b:E[]):E[] {return this.reduce(polynomialAdd(a,b,this.base));}
  sub(a:E[],b:E[]):E[] {return this.reduce(polynomialSubtract(a,b,this.base));}
  mul(a:E[],b:E[]):E[] {return this.reduce(polynomialMultiply(a,b,this.base));}
  sign(value:E[]):Sign {
    let p=this.reduce(value); if(p.length<2)return this.base.sign(p[0]??this.base.zero);
    // Exact interval Horner evaluation often proves the sign without a GCD
    // and a second Sturm sequence. This is an outward enclosure over the
    // isolating interval, not floating point sampling. An interval containing
    // zero always falls through to the existing algebraic equality procedure.
    const f=this.base;
    // Refining a nested field can multiply exact-equality work. Only the
    // rational base gets the additional interval attempts.
    const refinements=this.modulus.length>3&&f.rationalBase?32:1;
    for(let attempt=0;attempt<refinements;attempt++){
      const left=f.fromRational(this.root.lower),right=f.fromRational(this.root.upper);
      let lower:E=p.at(-1)!,upper:E=lower;
      for(let i=p.length-2;i>=0;i--){
        const products=[f.mul(lower,left),f.mul(lower,right),f.mul(upper,left),f.mul(upper,right)];
        let lo:E=products[0]!,hi:E=lo;
        for(const product of products.slice(1)){if(f.sign(f.sub(product,lo))<0)lo=product;if(f.sign(f.sub(product,hi))>0)hi=product;}
        lower=f.add(lo,p[i]!);upper=f.add(hi,p[i]!);
      }
      if(f.sign(lower)>0)return 1;if(f.sign(upper)<0)return -1;
      if(compare(this.root.lower,this.root.upper)===0)return f.sign(evaluate(p,left,f));
      if(refinements>1)refineRoot(this.root,f);
    }
    const common=gcd(this.modulus,p,this.base);
    if(common.length>1){
      if(vanishes(this.root,common,this.base)){
        this.modulus=common;this.root.polynomial=common;return 0;
      }
      this.modulus=exactDivide(this.modulus,common,this.base);this.root.polynomial=this.modulus;
      p=this.reduce(value);if(p.length<2)return this.base.sign(p[0]??this.base.zero);
    }
    while(countRoots(p,this.root.lower,this.root.upper,this.base)>0) {refineRoot(this.root,this.base);p=this.reduce(value);if(p.length<2)return this.base.sign(p[0]??this.base.zero);}
    return this.base.sign(evaluate(p,this.base.fromRational(divide(add(this.root.lower,this.root.upper),rational(2n))),this.base));
  }
  div(a:E[],b:E[]):E[] {
    let divisor=this.reduce(b); if(this.sign(divisor)===0)throw new PolynomialError('ZERO_DIVISOR');
    divisor=this.reduce(b);
    if(divisor.length===1)return this.reduce(scale(a,this.base.div(this.base.one,divisor[0]!),this.base));
    const common=gcd(this.modulus,divisor,this.base);
    if(common.length>1) {this.modulus=exactDivide(this.modulus,common,this.base);divisor=this.reduce(divisor);}
    let r0=this.modulus,r1=divisor,s0:E[]=[],s1:E[]=[this.base.one];
    while(r1.length) {
      const {quotient,remainder}=divRem(r0,r1,this.base);
      let next=polynomialSubtract(s0,polynomialMultiply(quotient,s1,this.base),this.base),normalized=remainder;
      if(remainder.length){const factor=this.base.div(this.base.one,remainder.at(-1)!);normalized=scale(remainder,factor,this.base);next=scale(next,factor,this.base);}
      [r0,r1]=[r1,normalized];[s0,s1]=[s1,next];
    }
    if(r0.length!==1)throw new PolynomialError('ZERO_DIVISOR');
    return this.mul(a,scale(s0,this.base.div(this.base.one,r0[0]!),this.base));
  }
}

/** Resultant in t; each t coefficient is a polynomial in u. Determinant via
 * subset dynamic programming avoids division over the polynomial coefficient ring.
 */
export function resultant(a:Polynomial<Rational>[],b:Polynomial<Rational>[]):Rational[] {
  const clean=(p:Polynomial<Rational>[])=>{const out=p.map(c=>trim(c,rationals));while(out.length&&!out.at(-1)!.length)out.pop();return out;};
  const x=clean(a),y=clean(b); if(!x.length||!y.length)return [];
  const m=x.length-1,n=y.length-1,size=m+n;if(size===0)return [rational(1n)];
  if(size>6)throw new PolynomialError('RESULTANT_DEGREE_UNSUPPORTED');
  const matrix=Array.from({length:size},()=>Array.from({length:size},()=>[] as Rational[]));
  for(let row=0;row<n;row++)for(let i=0;i<=m;i++)matrix[row]![row+i]=x[m-i]!;
  for(let row=0;row<m;row++)for(let i=0;i<=n;i++)matrix[n+row]![row+i]=y[n-i]!;
  const dp=new Map<number,Rational[]>([[0,[rational(1n)]]]);
  for(let mask=0;mask<(1<<size);mask++) {
    const value=dp.get(mask);if(!value)continue;
    let row=0;for(let k=mask;k;k&=k-1)row++;if(row===size)continue;
    for(let col=0;col<size;col++)if(!(mask&(1<<col))) {
      let inversions=0;for(let k=mask>>(col+1);k;k&=k-1)inversions++;
      const term=scale(polynomialMultiply(value,matrix[row]![col]!,rationals),rational(inversions%2?-1n:1n),rationals),next=mask|(1<<col);
      dp.set(next,polynomialAdd(dp.get(next)??[],term,rationals));
    }
  }
  return dp.get((1<<size)-1)??[];
}
