import type { Coordinate } from './model.js';

export type Sign = -1|0|1;
export class NumericError extends Error {
  constructor(readonly code:'NON_FINITE_INPUT'|'DIVISION_BY_ZERO'|'INVALID_INTERVAL'|'INVALID_DISTANCE') {
    super(`No se pudo completar el cálculo numérico: ${code}`); this.name='NumericError';
  }
}
export interface Rational { readonly n:bigint; readonly d:bigint }
const sign=(n:bigint):Sign=>n<0n?-1:n>0n?1:0;
const abs=(n:bigint)=>n<0n?-n:n;
function gcd(a:bigint,b:bigint):bigint { a=abs(a); b=abs(b); while(b) { const r=a%b; a=b; b=r; } return a; }
export function rational(n:bigint,d=1n):Rational {
  if(d===0n) throw new NumericError('DIVISION_BY_ZERO');
  if(d<0n) { n=-n; d=-d; } const g=gcd(n,d);
  return Object.freeze({n:n/g,d:d/g});
}
function finite(n:number) { if(!Number.isFinite(n)) throw new NumericError('NON_FINITE_INPUT'); }
/** Exact value of the stored IEEE-754 number, not of its decimal spelling. */
export function fromNumber(value:number):Rational {
  finite(value); const view=new DataView(new ArrayBuffer(8)); view.setFloat64(0,value);
  const bits=view.getBigUint64(0),exponent=Number((bits>>52n)&2047n);
  let mantissa=(bits&((1n<<52n)-1n))+(exponent?1n<<52n:0n);
  if(bits>>63n) mantissa=-mantissa;
  const shift=(exponent||1)-1075;
  return shift>=0?rational(mantissa<<BigInt(shift)):rational(mantissa,1n<<BigInt(-shift));
}
export function add(a:Rational,b:Rational):Rational {
  const g=gcd(a.d,b.d); return rational(a.n*(b.d/g)+b.n*(a.d/g),(a.d/g)*b.d);
}
export function subtract(a:Rational,b:Rational):Rational { return add(a,{n:-b.n,d:b.d}); }
export function multiply(a:Rational,b:Rational):Rational {
  const g=gcd(a.n,b.d),h=gcd(b.n,a.d);
  return rational((a.n/g)*(b.n/h),(a.d/h)*(b.d/g));
}
export function divide(a:Rational,b:Rational):Rational {
  if(b.n===0n) throw new NumericError('DIVISION_BY_ZERO');
  return multiply(a,rational(b.d,b.n));
}
export function compare(a:Rational,b:Rational):Sign { return sign(a.n*b.d-b.n*a.d); }

export interface Interval { readonly lo:number; readonly hi:number }
/** Extended endpoints are allowed for conservative bounds, never as geometry. */
export function interval(lo:number,hi=lo):Interval {
  if(Number.isNaN(lo)||Number.isNaN(hi)||lo>hi) throw new NumericError('INVALID_INTERVAL');
  return Object.freeze({lo,hi});
}
export function nextUp(value:number):number {
  if(Number.isNaN(value)) throw new NumericError('NON_FINITE_INPUT');
  if(value===Infinity) return value;
  if(value===0) return Number.MIN_VALUE;
  const view=new DataView(new ArrayBuffer(8)); view.setFloat64(0,value);
  view.setBigUint64(0,view.getBigUint64(0)+(value>0?1n:-1n));
  const result=view.getFloat64(0); return result===0?0:result;
}
export function nextDown(value:number):number { const result=-nextUp(-value); return result===0?0:result; }
const whole=()=>interval(-Infinity,Infinity);
function outward(lo:number,hi:number):Interval {
  if(Number.isNaN(lo)||Number.isNaN(hi)) return whole();
  return interval(nextDown(lo),nextUp(hi));
}
function check(a:Interval) { interval(a.lo,a.hi); }
export function intervalAdd(a:Interval,b:Interval):Interval {
  check(a); check(b); return outward(a.lo+b.lo,a.hi+b.hi);
}
export function intervalSubtract(a:Interval,b:Interval):Interval {
  check(a); check(b); return outward(a.lo-b.hi,a.hi-b.lo);
}
export function intervalMultiply(a:Interval,b:Interval):Interval {
  check(a); check(b); const products=[a.lo*b.lo,a.lo*b.hi,a.hi*b.lo,a.hi*b.hi];
  if(products.some(Number.isNaN)) return whole();
  return outward(Math.min(...products),Math.max(...products));
}
export function intervalDivide(a:Interval,b:Interval):Interval {
  check(a); check(b); if(b.lo<=0&&b.hi>=0) return whole();
  return intervalMultiply(a,outward(1/b.hi,1/b.lo));
}
/** Zero-containing bounds are uncertain, including [0,0]; exact fallback decides. */
export function intervalSign(value:Interval):Sign|undefined {
  check(value); return value.lo>0?1:value.hi<0?-1:undefined;
}
export function filteredSign(bound:Interval,exact:()=>Rational):Sign {
  const quick=intervalSign(bound); return quick===undefined?sign(exact().n):quick;
}
function point(p:Coordinate) { finite(p.x); finite(p.y); }
export function orientation(a:Coordinate,b:Coordinate,c:Coordinate):Sign {
  point(a); point(b); point(c);
  const bx=intervalSubtract(interval(b.x),interval(a.x)),by=intervalSubtract(interval(b.y),interval(a.y));
  const cx=intervalSubtract(interval(c.x),interval(a.x)),cy=intervalSubtract(interval(c.y),interval(a.y));
  return filteredSign(intervalSubtract(intervalMultiply(bx,cy),intervalMultiply(by,cx)),()=>{
    const ax=fromNumber(a.x),ay=fromNumber(a.y);
    return subtract(multiply(subtract(fromNumber(b.x),ax),subtract(fromNumber(c.y),ay)),multiply(subtract(fromNumber(b.y),ay),subtract(fromNumber(c.x),ax)));
  });
}
/** Compare |a-b| with a nonnegative distance, without square roots or epsilon. */
export function compareDistance(a:Coordinate,b:Coordinate,distance:number):Sign {
  point(a); point(b); finite(distance); if(distance<0) throw new NumericError('INVALID_DISTANCE');
  const x=intervalSubtract(interval(a.x),interval(b.x)),y=intervalSubtract(interval(a.y),interval(b.y)),d=interval(distance);
  const bound=intervalSubtract(intervalAdd(intervalMultiply(x,x),intervalMultiply(y,y)),intervalMultiply(d,d));
  return filteredSign(bound,()=>{
    const x=subtract(fromNumber(a.x),fromNumber(b.x)),y=subtract(fromNumber(a.y),fromNumber(b.y)),d=fromNumber(distance);
    return subtract(add(multiply(x,x),multiply(y,y)),multiply(d,d));
  });
}
