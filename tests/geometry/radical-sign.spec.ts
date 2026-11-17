import {expect,it} from 'vitest';
import {AlgebraicContext} from '../../packages/geometry/src/algebraic.js';
import {radicalNonnegative} from '../../packages/geometry/src/radical-sign.js';
it.each([1,-1])('does not infer the actual radical sign from a zero norm: %s',sign=>{
 const f=new AlgebraicContext(),one=[[f.one]],two=[[f.number(2)]],r=[[f.number(sign)]];
 // S=T=1, R=+/-1, A=1 => norm zero for both, actual values 2 and 0.
 expect(radicalNonnegative(f,r,one,[],[],one,one)).toBe(true);
 // R=-2, A=-2 has the same identically-zero norm as R=-2,A=2.
 expect(radicalNonnegative(f,[[f.number(-2)]],[[f.number(2*sign)]],[],[],one,one)).toBe(sign>0);
 expect(radicalNonnegative(f,[[f.number(-1)]],one,[],[],two,one)).toBe(true);
});
it('tracks a branch collision with a sign change on an interior fibre',()=>{
 const f=new AlgebraicContext(),one=[[f.one]],r=[[f.number(-.5),f.one]];
 expect(radicalNonnegative(f,r,r,[],[],one,one)).toBe(false);
});
it('handles identical nonconstant radicals and their identically zero norm',()=>{
 const f=new AlgebraicContext(),one=[[f.one]],minus=[ [f.number(-1)] ],s=[[f.one],[],[f.one]];
 expect(radicalNonnegative(f,[],one,minus,[],s,s)).toBe(true);
 expect(radicalNonnegative(f,minus,one,minus,[],s,s)).toBe(false);
});
it('keeps the positive square-root branch at a repeated zero',()=>{
 const f=new AlgebraicContext(),one=[[f.one]],s=[[f.one],[],[f.one]];
 expect(radicalNonnegative(f,[[f.number(-1)]],one,[],[],s,one)).toBe(true);
});
