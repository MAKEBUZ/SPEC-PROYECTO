import {expect,it} from 'vitest';
import {AlgebraicContext} from '../../packages/geometry/src/algebraic.js';
import {algebraicResultant} from '../../packages/geometry/src/algebraic-elimination.js';
import {evaluate} from '../../packages/geometry/src/polynomials.js';

it('eliminates a variable without rounding algebraic coefficients',()=>{
 const f=new AlgebraicContext(),root=f.sqrt(f.number(2));
 // t - sqrt(2) = 0, t*u - 1 = 0 => sqrt(2)*u - 1 = 0.
 const r=algebraicResultant([[f.sub(f.zero,root)],[f.one]],[[f.number(-1)],[f.zero,f.one]],f);
 expect(r.length).toBe(2);
 expect(f.sign(evaluate(r,f.div(f.one,root),f))).toBe(0);
 expect(f.sign(evaluate(r,f.zero,f))).toBe(-1);
 expect(f.sign(evaluate(r,f.one,f))).toBe(1);
});
it('eliminates a quadratic against a linear equation and preserves multiplicity',()=>{
 const f=new AlgebraicContext();
 // t^2 - u = 0, t - u = 0 => u^2 - u = 0.
 const r=algebraicResultant([[f.zero,f.number(-1)],[],[f.one]],[[f.zero,f.number(-1)],[f.one]],f);
 expect(r.map(x=>f.sign(x))).toEqual([0,-1,1]);
 expect(f.roots(r).map(x=>f.compare(x,f.number(.5)))).toEqual([-1,1]);
});
it('returns zero for a common component instead of inventing isolated roots',()=>{
 const f=new AlgebraicContext(),p=[[f.zero,f.number(-1)],[f.one]];
 expect(algebraicResultant(p,p,f)).toEqual([]);
 expect(algebraicResultant([],p,f)).toEqual([]);
});
