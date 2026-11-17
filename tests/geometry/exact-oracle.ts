// Test-only polynomial oracle. No intersection solver, tolerance or production
// validator is implemented here. Operands are exact stored binary64 values.
import type { Curve, XY } from './fixtures.js';
export type Q = readonly [bigint,bigint];
export function q(n: bigint, d = 1n): Q {
  if (!d) throw new Error('Denominador cero');
  if (d<0n) { n=-n; d=-d; } let a=n<0n?-n:n, b=d;
  while (b) { const r=a%b; a=b; b=r; } return [n/a,d/a];
}
export const add = (a: Q,b: Q) => q(a[0]*b[1]+b[0]*a[1],a[1]*b[1]);
export const mul = (a: Q,b: Q) => q(a[0]*b[0],a[1]*b[1]);
const neg = (a: Q): Q => [-a[0],a[1]];
export function binary(value: number): Q {
  if (!Number.isFinite(value)) throw new Error('Entrada no finita');
  const view = new DataView(new ArrayBuffer(8)); view.setFloat64(0,value);
  const bits=view.getBigUint64(0), exponent=Number((bits>>52n)&2047n);
  const mantissa=(bits&((1n<<52n)-1n))+(exponent?1n<<52n:0n);
  const n=(bits>>63n)?-mantissa:mantissa, shift=(exponent || 1)-1023-52;
  return shift>=0 ? q(n<<BigInt(shift)) : q(n,1n<<BigInt(-shift));
}
export function coefficients(curve: Curve, axis: 0|1): Q[] {
  const p=curve.map(point => binary(point[axis])), a=p[0]!, b=p[1]!;
  if (curve.length===2) return [a,add(b,neg(a))];
  const c=p[2]!,d=p[3]!;
  return [a,mul(q(3n),add(b,neg(a))),mul(q(3n),add(add(a,mul(q(-2n),b)),c)),add(add(neg(a),mul(q(3n),b)),add(mul(q(-3n),c),d))];
}
export function valueAt(curve: Curve, t: number): readonly [Q,Q] {
  const evaluate=(axis: 0|1) => coefficients(curve,axis).reverse().reduce((value,c) => add(mul(value,binary(t)),c),q(0n));
  return [evaluate(0),evaluate(1)];
}
export function signedArea(curves: Curve[]): Q {
  let total=q(0n);
  for (const curve of curves) {
    const x=coefficients(curve,0),y=coefficients(curve,1);
    for (let i=0;i<x.length;i++) for (let j=1;j<y.length;j++) {
      const term=add(mul(x[i]!,y[j]!),neg(mul(y[i]!,x[j]!)));
      total=add(total,mul(term,q(BigInt(j),2n*BigInt(i+j))));
    }
  }
  return total;
}
export const exactPoint = (p: XY) => p.map(binary);
