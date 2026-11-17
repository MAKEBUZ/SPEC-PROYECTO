import {polynomialMultiply as mul,polynomialSubtract as sub,exactDivide,scale,trim,type OrderedField} from './polynomials.js';
import {rational} from './numeric.js';
/** Eliminate t from two polynomials in t with coefficients in E[u]. */
export function algebraicResultant<E>(a:readonly (readonly E[])[],b:readonly (readonly E[])[],f:OrderedField<E>):E[]{
 const clean=(p:readonly (readonly E[])[])=>{const result=p.map(row=>trim(row,f));while(result.length&&!result.at(-1)!.length)result.pop();return result;};
 const x=clean(a),y=clean(b);if(!x.length||!y.length)return [];
 const m=x.length-1,n=y.length-1,size=m+n;if(!size)return [f.one];
 const matrix=Array.from({length:size},()=>Array.from({length:size},()=>[] as E[]));
 for(let row=0;row<n;row++)for(let i=0;i<=m;i++)matrix[row]![row+i]=x[m-i]!;
 for(let row=0;row<m;row++)for(let i=0;i<=n;i++)matrix[n+row]![row+i]=y[n-i]!;
 let previous=[f.one],sign=1n;
 for(let k=0;k<size-1;k++){
  const pivotRow=matrix.findIndex((row,i)=>i>=k&&row[k]!.length>0);if(pivotRow<0)return [];
  if(pivotRow!==k){[matrix[k],matrix[pivotRow]]=[matrix[pivotRow]!,matrix[k]!];sign=-sign;}
  const pivot=matrix[k]![k]!;
  for(let i=k+1;i<size;i++)for(let j=k+1;j<size;j++)matrix[i]![j]=exactDivide(sub(mul(pivot,matrix[i]![j]!,f),mul(matrix[i]![k]!,matrix[k]![j]!,f),f),previous,f);
  for(let i=k+1;i<size;i++)matrix[i]![k]=[];previous=pivot;
 }
 return scale(matrix[size-1]![size-1]!,f.fromRational(rational(sign)),f);
}
