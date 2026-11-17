import { expect,it } from 'vitest';
import { analyzeContour, segmentControls, isConstant, pathIntegral, controlBounds } from '../../packages/geometry/src/contour-validation.js';
import { areas,constants,polygon } from '../geometry/fixtures.js';
import { rational } from '../../packages/geometry/src/numeric.js';
it.each(constants)('$name: constancia considera la trayectoria completa',fixture=>{
  expect(isConstant(fixture.curve.map(([x,y])=>({x,y})))).toBe(fixture.constant);
});
it.each(areas)('$name: integral exacta igual a resultado analítico independiente',fixture=>{
  expect(pathIntegral(fixture.curves.map(curve=>curve.map(([x,y])=>({x,y}))))).toEqual(rational(fixture.numerator,fixture.denominator));
});
it('contorno abierto conserva integral como indefinida para área y no repara IDs',()=>{
  const c=polygon([[0,0],[4,0],[4,3],[0,0]],false),before=structuredClone(c),result=analyzeContour(c);
  expect(result.closed).toBe(false); expect(result.signedArea).toBeNull(); expect(result.gaps).toHaveLength(1); expect(c).toEqual(before);
});
it('hueco interior y cierre se diagnostican por separado',()=>{
  const c=polygon([[0,0],[4,0],[4,3],[0,3]]); c.segments[1]!.startId=c.points[0]!.id;
  expect(analyzeContour(c).gaps).toEqual([{after:c.segments[0]!.id,before:c.segments[1]!.id}]);
});
it('área cero y segmentos constantes se identifican sin eliminar el borrador',()=>{
  const c=polygon([[0,0],[4,0],[4,0]]),before=structuredClone(c),result=analyzeContour(c);
  expect(result.closed).toBe(true); expect(result.signedArea).toEqual(rational(0n)); expect(result.constantSegmentIds).toEqual([c.segments[1]!.id]); expect(c).toEqual(before);
});
it('vacío no es un contorno cerrado ni tiene una caja inventada',()=>{
  expect(analyzeContour({points:[],segments:[]})).toEqual({closed:false,gaps:[],constantSegmentIds:[],signedArea:null,bounds:null});
});
it('caja cúbica incluye tiradores y se declara conservadora, no medida exacta',()=>{
  const controls=[{x:0,y:0},{x:100,y:80},{x:-100,y:-80},{x:0,y:0}];
  expect(controlBounds(controls)).toEqual({minX:-100,maxX:100,minY:-80,maxY:80});
  expect(isConstant(controls)).toBe(false);
});
it('cajas de trayectorias no incluyen puntos sueltos y no restan extremos hasta overflow',()=>{
  const c=polygon([[-1e308,0],[1e308,0]]); c.points.push({id:'99999999-0000-4000-8000-000000000001',x:0,y:1e308});
  expect(analyzeContour(c).bounds).toEqual({minX:-1e308,maxX:1e308,minY:0,maxY:0});
});
it('resolver tiradores devuelve coordenadas independientes sin exponer puntos mutables',()=>{
  const c=polygon([[0,0],[4,0]]),controls=segmentControls(c,c.segments[0]!.id); controls[0]!.x=99;
  expect(c.points[0]!.x).toBe(0); expect(()=>segmentControls(c,'missing')).toThrow();
});
it('entradas inválidas producen error, nunca área cero o caja válida',()=>{
  expect(()=>isConstant([{x:NaN,y:0},{x:0,y:0}])).toThrow();
  expect(()=>pathIntegral([[{x:0,y:0}]])).toThrow();
  const c=polygon([[0,0],[1,0]]); c.segments[0]!.endId='missing'; expect(()=>analyzeContour(c)).toThrow();
});
it('traslación grande no cancela el área pequeña y la orientación conserva su signo',()=>{
  const a=2**50,c=polygon([[a,a],[a+.25,a],[a+.25,a+.25],[a,a+.25]]);
  expect(analyzeContour(c).signedArea).toEqual(rational(1n,16n));
});
it('lazo cúbico de un segmento está cerrado pero no tiene longitud cero',()=>{
  const point={id:'00000000-0000-4000-8000-000000000001',x:0,y:0};
  const segment={id:'00000000-0000-4000-8000-000000000002',kind:'cubic' as const,startId:point.id,endId:point.id,handleStart:{x:4,y:0},handleEnd:{x:0,y:4}};
  const result=analyzeContour({points:[point],segments:[segment]});
  expect(result.closed).toBe(true); expect(result.constantSegmentIds).toEqual([]); expect(result.signedArea).toEqual(rational(12n,5n));
  expect(result.bounds).toEqual({minX:0,maxX:4,minY:0,maxY:4});
});
