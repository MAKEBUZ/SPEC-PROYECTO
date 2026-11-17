import { describe, it, expect } from 'vitest';
import { rational as q } from '../../packages/geometry/src/numeric.js';
import { rationals as Q, isolateRoots, RootField, polynomialMultiply, resultant, evaluate, countRoots } from '../../packages/geometry/src/polynomials.js';
const p=(...n:number[])=>n.map(x=>q(BigInt(x)));
describe('exact polynomial roots',()=>{
  it('isolates repeated roots and both endpoints',()=>{
    const roots=isolateRoots(polynomialMultiply(p(0,-1,1),p(1,-2,1),Q),q(0n),q(1n),Q);
    expect(roots.map(r=>[r.lower,r.multiplicity])).toEqual([[q(0n),1],[q(1n),3]]);
  });
  it('orders irrational roots and computes in their field',()=>{
    const root=isolateRoots(p(-2,0,1),q(0n),q(2n),Q)[0]!;
    const K=new RootField(Q,root),a=K.generator;
    expect(K.sign(K.sub(K.mul(a,a),K.fromRational(q(2n))))).toBe(0);
    expect(K.sign(K.sub(a,K.one))).toBe(1);
    expect(K.sign(K.sub(K.mul(a,K.div(K.one,a)),K.one))).toBe(0);
  });
  it('splits reducible defining polynomials for inversion',()=>{
    const root=isolateRoots(polynomialMultiply(p(-2,0,1),p(-3,1),Q),q(1n),q(2n),Q)[0]!;
    const K=new RootField(Q,root),b=K.sub(K.generator,K.fromRational(q(3n)));
    expect(K.sign(K.sub(K.mul(b,K.div(K.one,b)),K.one))).toBe(0);
  });
  it('keeps exact signs around close rational bounds and zero with interval acceleration',()=>{
    const K=new RootField(Q,isolateRoots(p(-2,0,1),q(1n),q(2n),Q)[0]!);
    const a=K.generator,below=K.fromRational(q(14142135623730950n,10000000000000000n)),above=K.fromRational(q(14142135623730951n,10000000000000000n));
    expect(K.sign(K.sub(a,below))).toBe(1);expect(K.sign(K.sub(a,above))).toBe(-1);
    expect(K.sign(K.sub(K.mul(a,a),K.fromRational(q(2n))))).toBe(0);
    const negative=new RootField(Q,isolateRoots(p(-2,0,1),q(-2n),q(-1n),Q)[0]!);
    expect(negative.sign(negative.generator)).toBe(-1);
    expect(negative.sign(negative.sub(negative.mul(negative.generator,negative.generator),negative.one))).toBe(1);
  });
  it('does not merge positive dyadic separations',()=>{
    const tiny=q(1n,1n<<600n),roots=isolateRoots([q(0n),Q.sub(Q.zero,tiny),q(1n)],q(0n),tiny,Q);
    expect(roots).toHaveLength(2);
  });
  it('computes elimination without floating point',()=>{
    const r=resultant([p(0,-1),p(1)],[p(-2),[],p(1)]);
    expect(evaluate(r,q(2n),Q)).toEqual(q(2n));
    expect(resultant([p(0,-1),p(1)],[p(0,-1),p(1)])).toEqual([]);
  });
  it('rejects the zero polynomial instead of returning no roots',()=>{
    expect(()=>isolateRoots([],q(0n),q(1n),Q)).toThrow('ZERO_POLYNOMIAL');
  });
  it('counts open intervals correctly at repeated endpoint roots',()=>{
    const polynomial=polynomialMultiply(p(1,-2,1),p(-2,1),Q);
    expect(countRoots(polynomial,q(0n),q(1n),Q)).toBe(0);
    expect(countRoots(polynomial,q(0n),q(2n),Q)).toBe(1);
    expect(countRoots(polynomial,q(1n),q(3n),Q)).toBe(1);
  });
});
