import { expect, it } from 'vitest';
import { rational, fromNumber, add, subtract, multiply, divide, compare, nextUp, nextDown, interval, intervalAdd, intervalSubtract, intervalMultiply, intervalDivide, orientation, compareDistance, NumericError, filteredSign } from '../../packages/geometry/src/numeric.js';
it('normaliza signo, reduce racionales y conserva subnormales exactos',()=>{
  expect(rational(6n,-8n)).toEqual({n:-3n,d:4n}); expect(rational(0n,-7n)).toEqual({n:0n,d:1n});
  expect(fromNumber(.1)).toEqual({n:3602879701896397n,d:36028797018963968n});
  expect(fromNumber(Number.MIN_VALUE)).toEqual({n:1n,d:2n**1074n}); expect(fromNumber(-0)).toEqual(rational(0n));
});
it('operaciones racionales exactas sin convertir a double',()=>{
  const a=rational(1n,3n),b=rational(1n,6n);
  expect(add(a,b)).toEqual(rational(1n,2n)); expect(subtract(a,b)).toEqual(b);
  expect(multiply(a,b)).toEqual(rational(1n,18n)); expect(divide(a,b)).toEqual(rational(2n));
  expect(compare(rational(1n,2n**1200n),rational(0n))).toBe(1);
});
it('errores numéricos son explícitos, nunca cero o validez geométrica',()=>{
  for(const n of [NaN,Infinity,-Infinity]) expect(()=>fromNumber(n)).toThrow(NumericError);
  expect(()=>rational(1n,0n)).toThrow(NumericError); expect(()=>divide(rational(1n),rational(0n))).toThrow(NumericError);
  expect(()=>interval(2,1)).toThrow(NumericError); expect(()=>interval(NaN)).toThrow(NumericError);
});
it('vecinos IEEE incluyen cero, subnormales, máximos e infinitos',()=>{
  expect(nextUp(0)).toBe(Number.MIN_VALUE); expect(nextDown(-0)).toBe(-Number.MIN_VALUE);
  expect(nextUp(-Number.MIN_VALUE)).toBe(0); expect(nextDown(Number.MIN_VALUE)).toBe(0);
  expect(nextUp(Number.MAX_VALUE)).toBe(Infinity); expect(nextDown(Infinity)).toBe(Number.MAX_VALUE);
  expect(nextUp(-Infinity)).toBe(-Number.MAX_VALUE); expect(nextDown(-Number.MAX_VALUE)).toBe(-Infinity);
  expect(nextDown(nextUp(1))).toBe(1); expect(()=>nextUp(NaN)).toThrow(NumericError);
});
it('intervalos encierran operaciones exactas aun con redondeo, overflow y underflow',()=>{
  for(const [a,b] of [[.1,.2],[Number.MIN_VALUE,.5],[Number.MAX_VALUE,2],[-1e200,1e200],[1,-1],[2**-600,2**-600]]) {
    for(const [result,exact] of [[intervalAdd(interval(a!),interval(b!)),add(fromNumber(a!),fromNumber(b!))],[intervalSubtract(interval(a!),interval(b!)),subtract(fromNumber(a!),fromNumber(b!))],[intervalMultiply(interval(a!),interval(b!)),multiply(fromNumber(a!),fromNumber(b!))],[intervalDivide(interval(a!),interval(b!)),divide(fromNumber(a!),fromNumber(b!))]] as const) {
      if(Number.isFinite(result.lo)) expect(compare(fromNumber(result.lo),exact)).toBeLessThanOrEqual(0);
      if(Number.isFinite(result.hi)) expect(compare(fromNumber(result.hi),exact)).toBeGreaterThanOrEqual(0);
    }
  }
  expect(intervalDivide(interval(1),interval(-1,1))).toEqual({lo:-Infinity,hi:Infinity});
  expect(intervalMultiply(interval(0),interval(-Infinity,Infinity))).toEqual({lo:-Infinity,hi:Infinity});
});
it('orientación exacta ante cancelación, subdesbordamiento y sobreflujo',()=>{
  const o={x:0,y:0};
  expect(orientation(o,{x:1,y:1},{x:2,y:2})).toBe(0);
  expect(orientation(o,{x:2**-600,y:0},{x:0,y:2**-600})).toBe(1);
  expect(orientation(o,{x:1e308,y:0},{x:0,y:1e308})).toBe(1);
  expect(orientation(o,{x:1,y:1},{x:1,y:nextUp(1)})).toBe(1);
  expect(orientation(o,{x:1,y:nextUp(1)},{x:1,y:1})).toBe(-1);
  expect(()=>orientation(o,{x:Infinity,y:0},o)).toThrow(NumericError);
});
it('distancias comparan exactamente el umbral de 2 mm y nunca eliminan positivos',()=>{
  const o={x:0,y:0};
  expect(compareDistance(o,{x:2,y:0},2)).toBe(0);
  expect(compareDistance(o,{x:nextDown(2),y:0},2)).toBe(-1);
  expect(compareDistance(o,{x:nextUp(2),y:0},2)).toBe(1);
  expect(compareDistance(o,{x:Number.MIN_VALUE,y:0},0)).toBe(1);
  expect(compareDistance(o,{x:3,y:4},5)).toBe(0);
  expect(()=>compareDistance(o,o,-1)).toThrow(NumericError);
});
it('el filtro evita cálculo exacto solo con signo demostrado',()=>{
  let calls=0; const exact=()=>{calls++; return rational(-1n,2n**1200n);};
  expect(filteredSign(interval(1,2),exact)).toBe(1); expect(calls).toBe(0);
  expect(filteredSign(interval(-1,1),exact)).toBe(-1); expect(calls).toBe(1);
  expect(filteredSign(interval(0),()=>rational(0n))).toBe(0);
  expect(()=>filteredSign(interval(-Infinity,Infinity),()=>{throw new Error('fallo técnico');})).toThrow('fallo técnico');
});
it('orientación coincide con determinantes enteros independientes y permutaciones',()=>{
  for(let x=-4;x<=4;x++) for(let y=-4;y<=4;y++) for(let z=-4;z<=4;z++) {
    const a={x:7,y:-3},b={x:7+x,y:-3+y},c={x:7+z,y:-1};
    const determinant=BigInt(x)*2n-BigInt(y)*BigInt(z),expected=determinant<0n?-1:determinant>0n?1:0;
    expect(orientation(a,b,c)).toBe(expected); expect(orientation(b,c,a)).toBe(expected); expect(orientation(a,c,b)).toBe(expected===0?0:-expected);
  }
});
it('restas que desbordan no pierden la orientación y no mutan entradas',()=>{
  const a=Object.freeze({x:-1e308,y:0}),b=Object.freeze({x:1e308,y:0}),c=Object.freeze({x:0,y:1e308});
  expect(orientation(a,b,c)).toBe(1); expect(compareDistance(a,b,Number.MAX_VALUE)).toBe(1);
});
it('intervalos no puntuales contienen todas las combinaciones de extremos',()=>{
  for(const a of [interval(-3,2),interval(1,4),interval(-5,-1)]) for(const b of [interval(-2,3),interval(2,7),interval(-8,-2)]) {
    const results=[intervalAdd(a,b),intervalSubtract(a,b),intervalMultiply(a,b),intervalDivide(a,b)];
    for(const x of [a.lo,a.hi]) for(const y of [b.lo,b.hi]) {
      const exacts=[add(fromNumber(x),fromNumber(y)),subtract(fromNumber(x),fromNumber(y)),multiply(fromNumber(x),fromNumber(y)),divide(fromNumber(x),fromNumber(y))];
      results.forEach((result,i)=>{if(Number.isFinite(result.lo)) expect(compare(fromNumber(result.lo),exacts[i]!)).toBeLessThanOrEqual(0); if(Number.isFinite(result.hi)) expect(compare(fromNumber(result.hi),exacts[i]!)).toBeGreaterThanOrEqual(0);});
    }
  }
});
