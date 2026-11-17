import type {AlgebraicContext,Exact} from './algebraic.js';
import {algebraicResultant} from './algebraic-elimination.js';
import {trim,gcd,exactDivide,derivative,evaluate,polynomialAdd as add,polynomialMultiply as mul,scale,type OrderedField} from './polynomials.js';
import {rational,add as qadd,divide as qdivide} from './numeric.js';

type Fraction={n:Exact[];d:Exact[]};
/** The fraction field is used only for Euclidean polynomial operations. Its
 * sign method is a zero test, not an ordering of rational functions. */
function fractions(f:AlgebraicContext):OrderedField<Fraction>{
 const make=(n:Exact[],d:Exact[]):Fraction=>{
  n=trim(n,f);d=trim(d,f);if(!d.length)throw Error('BIVARIATE_ZERO_DIVISOR');
  if(!n.length)return {n:[],d:[f.one]};
  const common=gcd(n,d,f),nn=exactDivide(n,common,f),dd=exactDivide(d,common,f),factor=f.div(f.one,dd.at(-1)!);
  return {n:scale(nn,factor,f),d:scale(dd,factor,f)};
 };
 const plus=(a:Fraction,b:Fraction)=>make(add(mul(a.n,b.d,f),mul(b.n,a.d,f),f),mul(a.d,b.d,f));
 return {zero:make([],[f.one]),one:make([f.one],[f.one]),fromRational:q=>make([f.fromRational(q)],[f.one]),
  add:plus,sub:(a,b)=>plus(a,{n:scale(b.n,f.number(-1),f),d:b.d}),
  mul:(a,b)=>make(mul(a.n,b.n,f),mul(a.d,b.d,f)),div:(a,b)=>make(mul(a.n,b.d,f),mul(a.d,b.n,f)),sign:a=>a.n.length?1:0};
}
function nonnegative(f:AlgebraicContext,p:Exact[]):boolean{
 const d=derivative(p,f),times=[f.zero,f.one,...(d.length?f.roots(d):[])];
 return times.every(t=>f.sign(evaluate(p,t,f))>=0);
}
/** Exact sign decision on [0,1]^2, coefficients in ascending powers of t,u.
 * Square-free projection prevents an identically zero discriminant from
 * discarding repeated/common components. Sections and open cells are both
 * tested, including nullification fibres and rectangle boundaries. */
export function nonnegativeOnUnitSquare(f:AlgebraicContext,input:readonly (readonly Exact[])[]):boolean{
 const p=input.map(row=>trim(row,f));while(p.length&&!p.at(-1)!.length)p.pop();
 if(!p.length)return true;if(p.length===1)return nonnegative(f,p[0]!);
 for(const t of [f.zero,f.one])for(const u of [f.zero,f.one])if(f.sign(evaluate(p.map(row=>evaluate(row,u,f)),t,f))<0)return false;
 // Convex-hull certificate on the complete square, not sampled values.
 const choose=(n:number,k:number)=>{let v=1n;for(let i=1;i<=k;i++)v=v*BigInt(n-i+1)/BigInt(i);return v;};
 const n=p.length-1,m=Math.max(...p.map(row=>row.length))-1;let positive=true;
 for(let i=0;i<=n&&positive;i++)for(let j=0;j<=m&&positive;j++){
  let coefficient=f.zero;
  for(let k=0;k<=i;k++)for(let l=0;l<=j;l++)if(p[k]?.[l])coefficient=f.add(coefficient,f.mul(p[k]![l]!,f.fromRational(rational(choose(i,k)*choose(j,l),choose(n,k)*choose(m,l)))));
  if(f.sign(coefficient)<0)positive=false;
 }
 if(positive)return true;
 let content:Exact[]=[];for(const row of p)content=gcd(content,row,f);
 const primitive=p.map(row=>exactDivide(row,content,f)),field=fractions(f),lift=primitive.map(n=>({n,d:[f.one]}));
 const repeated=gcd(lift,derivative(lift,field),field),sq=exactDivide(lift,repeated,field);
 const denominator=sq.reduce((product,c)=>mul(product,c.d,f),[f.one]);
 let squareFree=sq.map(c=>mul(c.n,exactDivide(denominator,c.d,f),f));
 let extra:Exact[]=[];for(const row of squareFree)extra=gcd(extra,row,f);
 squareFree=squareFree.map(row=>exactDivide(row,extra,f));
 const dt=squareFree.slice(1).map((row,i)=>scale(row,f.number(i+1),f));
 const projection=[content,denominator,extra,squareFree.at(-1)!,squareFree[0]??[],squareFree.reduce((s,row)=>add(s,row,f),[] as Exact[])];
 if(squareFree.length>1){const discriminant=algebraicResultant(squareFree,dt,f);if(!discriminant.length)throw Error('BIVARIATE_PROJECTION_NOT_SQUARE_FREE');projection.push(discriminant);}
 const cuts=[f.zero,f.one];
 for(const polynomial of projection)if(polynomial.length>1)for(const root of f.roots(polynomial))if(!cuts.some(c=>f.compare(c,root)===0))cuts.push(root);
 cuts.sort((a,b)=>f.compare(a,b));
 const fibre=(u:Exact)=>nonnegative(f,p.map(row=>evaluate(row,u,f)));
 for(const u of cuts)if(!fibre(u))return false;
 for(let i=1;i<cuts.length;i++){
  // Choose a rational inside the algebraic interval; no float conversion.
  let lo=rational(0n),hi=rational(1n);
  while(true){const mid=qdivide(qadd(lo,hi),rational(2n)),u=f.fromRational(mid);
   if(f.compare(u,cuts[i-1]!)<=0)lo=mid;
   else if(f.compare(u,cuts[i]!)>=0)hi=mid;
   else {if(!fibre(u))return false;break;}
  }
 }
 return true;
}

/** Sign-invariant cylindrical cells for a finite polynomial family. The
 * predicate must have constant truth value on these cells. Used for the
 * continuous real branches of normal-offset radical expressions. */
export function everySignCell(f:AlgebraicContext,inputs:Exact[][][],predicate:(t:Exact,u:Exact)=>boolean):boolean{
 const field=fractions(f),projection:Exact[][]=[],basis:Fraction[][]=[];
 const clear=(p:Fraction[])=>{
  const den=p.reduce((v,c)=>mul(v,c.d,f),[f.one]);projection.push(den);
  let rows=p.map(c=>mul(c.n,exactDivide(den,c.d,f),f)),content:Exact[]=[];
  for(const row of rows)content=gcd(content,row,f);
  if(content.length){projection.push(content);rows=rows.map(row=>exactDivide(row,content,f));}
  return rows;
 };
 const insert=(p:Fraction[]):void=>{
  p=trim(p,field);if(p.length<2)return;
  for(let i=0;i<basis.length;i++){
   const common=gcd(p,basis[i]!,field);if(common.length<2)continue;
   const previous=basis.splice(i,1)[0]!;
   insert(common);insert(exactDivide(previous,common,field));insert(exactDivide(p,common,field));return;
  }
  basis.push(p);
 };
 for(const input of inputs){
  const rows=input.map(row=>trim(row,f));while(rows.length&&!rows.at(-1)!.length)rows.pop();
  if(!rows.length)continue;
  let content:Exact[]=[];for(const row of rows)content=gcd(content,row,f);projection.push(content);
  const p=rows.map(row=>({n:exactDivide(row,content,f),d:[f.one]}));
  insert(exactDivide(p,gcd(p,derivative(p,field),field),field));
 }
 const polynomials=basis.map(clear);
 for(let i=0;i<polynomials.length;i++){
  const p=polynomials[i]!,dt=p.slice(1).map((row,j)=>scale(row,f.number(j+1),f));
  projection.push(...p,p.reduce((s,row)=>add(s,row,f),[] as Exact[]),algebraicResultant(p,dt,f));
  for(let j=0;j<i;j++){const r=algebraicResultant(p,polynomials[j]!,f);if(!r.length)throw Error('CAD_NON_COPRIME_BASIS');projection.push(r);}
 }
 const cells=(polys:Exact[][])=>{
  const roots=[f.zero,f.one];for(const p of polys)if(trim(p,f).length>1)for(const r of f.roots(p))if(!roots.some(v=>f.compare(v,r)===0))roots.push(r);
  roots.sort((a,b)=>f.compare(a,b));const result=[...roots];
  for(let i=1;i<roots.length;i++){
   let lo=rational(0n),hi=rational(1n);
   while(true){const mid=qdivide(qadd(lo,hi),rational(2n)),v=f.fromRational(mid);
    if(f.compare(v,roots[i-1]!)<=0)lo=mid;else if(f.compare(v,roots[i]!)>=0)hi=mid;else {result.push(v);break;}
   }
  }return result;
 };
 for(const u of cells(projection))for(const t of cells(inputs.map(p=>p.map(row=>evaluate(row,u,f)))))if(!predicate(t,u))return false;
 return true;
}
