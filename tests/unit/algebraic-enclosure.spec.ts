import {it,expect} from 'vitest';
import {AlgebraicContext} from '../../packages/geometry/src/algebraic.js';
it('preserves equality and near-zero signs in a tower of independent radicals',()=>{
 const f=new AlgebraicContext(),roots=[2,3,5,7,11].map(n=>f.sqrt(f.number(n)));
 const sum=roots.reduce((a,b)=>f.add(a,b),f.zero),square=f.square(sum);
 expect(f.sign(f.sub(square,f.mul(sum,sum)))).toBe(0);
 const small=f.number(2**-100),positive=f.add(f.sub(square,f.mul(sum,sum)),small);
 expect(f.sign(positive)).toBe(1);expect(f.sign(f.sub(f.zero,positive))).toBe(-1);
 for(let i=0;i<roots.length;i++)expect(f.compare(f.square(roots[i]!),f.number([2,3,5,7,11][i]!))).toBe(0);
});
it.each([Number.MIN_VALUE,2**-100,2,Number.MAX_VALUE])('encloses and squares the radical of %s exactly',n=>{
 const f=new AlgebraicContext(),root=f.sqrt(f.number(n));
 expect(f.sign(root)).toBe(1);expect(f.compare(f.square(root),f.number(n))).toBe(0);
});
