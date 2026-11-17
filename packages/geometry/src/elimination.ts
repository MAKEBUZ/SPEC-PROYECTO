import { rationals as Q, trim, polynomialAdd as add, polynomialSubtract as sub, polynomialMultiply as mul, scale, exactDivide, gcd } from './polynomials.js';
import type { Rational } from './numeric.js';
import { rational as q } from './numeric.js';
export type Bivariate=Rational[][]; // coefficients of t; each is a polynomial in u
export function clean(p:Bivariate):Bivariate {const r=p.map(c=>trim(c,Q));while(r.length&&!r.at(-1)!.length)r.pop();return r;}
export function biAdd(a:Bivariate,b:Bivariate):Bivariate{return clean(Array.from({length:Math.max(a.length,b.length)},(_,i)=>add(a[i]??[],b[i]??[],Q)));}
export function biScale(p:Bivariate,k:Rational):Bivariate{return clean(p.map(c=>scale(c,k,Q)));}
export function biSub(a:Bivariate,b:Bivariate):Bivariate{return biAdd(a,biScale(b,q(-1n)));}
export function biMul(a:Bivariate,b:Bivariate):Bivariate {
  if(!a.length||!b.length)return [];const r=Array.from({length:a.length+b.length-1},()=>[] as Rational[]);
  a.forEach((x,i)=>b.forEach((y,j)=>{r[i+j]=add(r[i+j]!,mul(x,y,Q),Q);}));return clean(r);
}
/** Exact division by t-u removes only the known self-intersection diagonal. */
export function divideDiagonal(p:Bivariate):Bivariate {
  return divideAffine(p,Q.one,Q.zero);
}
export function divideAffine(p:Bivariate,alpha:Rational,beta:Rational):Bivariate {
  const r=clean(p).map(c=>[...c]),out=Array.from({length:Math.max(0,r.length-1)},()=>[] as Rational[]);
  for(let i=r.length-1;i>0;i--){const c=r[i]!;out[i-1]=c;r[i-1]=add(r[i-1]!,mul(c,[beta,alpha],Q),Q);}
  if(trim(r[0]??[],Q).length)throw new Error('NON_DIVISIBLE_DIAGONAL');return clean(out);
}
/** Fraction-free Sylvester determinant. Unlike the small cubic resultant this
 * also handles the higher polynomial degrees of exact normal offsets. */
export function eliminate(a:Bivariate,b:Bivariate):Rational[] {
  const x=clean(a),y=clean(b);if(!x.length||!y.length)return [];
  const m=x.length-1,n=y.length-1,size=m+n;if(!size)return [Q.one];
  const matrix=Array.from({length:size},()=>Array.from({length:size},()=>[] as Rational[]));
  for(let r=0;r<n;r++)for(let i=0;i<=m;i++)matrix[r]![r+i]=x[m-i]!;
  for(let r=0;r<m;r++)for(let i=0;i<=n;i++)matrix[n+r]![r+i]=y[n-i]!;
  return determinant(matrix);
}
function determinant(matrix:Rational[][][]):Rational[] {
  const size=matrix.length;if(!size)return [Q.one];
  let previous=[Q.one],sign=1n;
  for(let k=0;k<size-1;k++){
    const pivotRow=matrix.findIndex((row,i)=>i>=k&&row[k]!.length>0);
    if(pivotRow<0)return [];
    if(pivotRow!==k){[matrix[k],matrix[pivotRow]]=[matrix[pivotRow]!,matrix[k]!];sign=-sign;}
    const pivot=matrix[k]![k]!;
    for(let i=k+1;i<size;i++)for(let j=k+1;j<size;j++){
      const numerator=sub(mul(pivot,matrix[i]![j]!,Q),mul(matrix[i]![k]!,matrix[k]![j]!,Q),Q);
      matrix[i]![j]=exactDivide(numerator,previous,Q);
    }
    for(let i=k+1;i<size;i++)matrix[i]![k]=[];
    previous=pivot;
  }
  return scale(matrix[size-1]![size-1]!,q(sign),Q);
}

/** A primitive pseudo-remainder relation. Where all recorded divisors are
 * nonzero, every common zero satisfies this linear relation in t. Degenerate
 * fibres must fall back to their specialized exact GCD. */
export function linearFibreRelation(a:Bivariate,b:Bivariate):{relation:Bivariate;guards:Rational[][]}|null {
  let x=clean(a),y=clean(b);const guards:Rational[][]=[];
  while(y.length>2){
    let r=x;
    while(r.length>=y.length){
      const lead=y.at(-1)!,rlead=r.at(-1)!,shift=r.length-y.length;
      guards.push(lead);
      const left=r.map(c=>mul(c,lead,Q)),right=[...Array.from({length:shift},()=>[] as Rational[]),...y.map(c=>mul(c,rlead,Q))];
      r=primitive(biSub(left,right));
      if(!r.length)break;
      let content:Rational[]=[];for(const coefficient of r)content=gcd(content,coefficient,Q);
      if(content.length>1){guards.push(content);r=primitive(r.map(c=>exactDivide(c,content,Q)));}
    }
    x=y;y=r;
  }
  return y.length===2?{relation:y,guards}:null;
}
function primitive(p:Bivariate):Bivariate {
  const gcdInt=(a:bigint,b:bigint)=>{a=a<0n?-a:a;b=b<0n?-b:b;while(b){[a,b]=[b,a%b];}return a;};
  let denominator=1n;for(const row of p)for(const c of row)denominator=denominator/gcdInt(denominator,c.d)*c.d;
  let content=0n;for(const row of p)for(const c of row)content=gcdInt(content,c.n*(denominator/c.d));
  if(!content)return [];return p.map(row=>row.map(c=>q(c.n*(denominator/c.d)/content)));
}
