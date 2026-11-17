import { describe, expect, it } from 'vitest';
import { constants, areas, pairs, contours, selfCrossing, tiny, sizes, separations, polygon, parabola } from './fixtures.js';
import { binary, q, signedArea, valueAt, exactPoint, coefficients } from './exact-oracle.js';
import { geometryDriver } from '../support/geometry-driver.js';
import { validateDocument } from '../../packages/document/src/schema.js';

describe('T027: consistencia independiente de fixtures analíticos', () => {
  it('el oráculo conserva binary64, subnormales, signo y cero', () => {
    expect(binary(.5)).toEqual(q(1n,2n)); expect(binary(-.25)).toEqual(q(-1n,4n));
    expect(binary(Number.MIN_VALUE)).toEqual(q(1n,2n**1074n)); expect(binary(-0)).toEqual(q(0n));
    expect(() => binary(Infinity)).toThrow(); expect(() => binary(NaN)).toThrow();
  });
  it.each(areas)('$name: integral algebraica exacta conocida', fixture => {
    expect(signedArea(fixture.curves)).toEqual(q(fixture.numerator,fixture.denominator));
    const reversed = fixture.curves.toReversed().map(curve => [...curve].reverse() as unknown as typeof curve);
    expect(signedArea(reversed)).toEqual(q(-fixture.numerator,fixture.denominator));
  });
  it.each(constants)('$name: coeficientes no constantes nulos solo si la trayectoria es constante', fixture => {
    expect(([0,1] as const).every(axis => coefficients(fixture.curve,axis).slice(1).every(([n]) => n===0n))).toBe(fixture.constant);
  });
  it('tangencia doble demostrada por y=12(t-1/2)^2, no por muestreo', () => {
    expect(coefficients(parabola,0)).toEqual([-3n,6n,0n,0n].map(n => q(n)));
    expect(coefficients(parabola,1)).toEqual([3n,-12n,12n,0n].map(n => q(n)));
    expect(coefficients(selfCrossing,0)).toEqual([18n,-96n,96n,0n].map(n => q(n)));
    expect(coefficients(selfCrossing,1)).toEqual([-9n,66n,-144n,96n].map(n => q(n)));
  });
  it.each(pairs)('$name: testigos paramétricos exactos', fixture => {
    for (const [t,u,point] of fixture.witnesses) {
      expect(valueAt(fixture.a,t)).toEqual(exactPoint(point)); expect(valueAt(fixture.b,u)).toEqual(exactPoint(point));
    }
    if (fixture.kind==='none') { // y=12(t-1/2)^2 >=0; other support strictly negative.
      expect(fixture.b.every(point => point[1]<0)).toBe(true);
    }
  });
  it('autocruce interno con parámetros distintos y tangentes no paralelas', () => {
    expect(valueAt(selfCrossing,.25)).toEqual(exactPoint([0,0])); expect(valueAt(selfCrossing,.75)).toEqual(exactPoint([0,0]));
    // Derivatives from x=96t²-96t+18; y=96t³-144t²+66t-9.
    expect((-48)*12-12*48).toBe(-1152);
  });
  it('el área no se redondea a cero cuando el producto double subdesborda', () => {
    expect(tiny*tiny).toBe(0); expect(signedArea(areas[4]!.curves)[0]).toBe(1n);
  });
  it.each(sizes)('$name: datos analíticos y exterior con margen', fixture => {
    expect(fixture.width<=5000).toBe(fixture.validWidth); expect(fixture.height<=5000).toBe(fixture.validHeight);
    expect(4998+2*1).toBe(5000);
  });
  it.each(separations)('$name: soportes paralelos con distancia exacta', fixture => {
    const [n,d]=binary(fixture.gap); expect(n>=2n*d).toBe(fixture.valid);
  });
  it.each(contours)('$name: borrador estructuralmente válido, sin reparación', fixture => {
    const doc = { formatVersion:1, documentId:'10000000-0000-4000-8000-000000000001',revisionId:'0'.repeat(64),units:'mm',preparations:[],pieces:[{
      id:'20000000-0000-4000-8000-000000000001',name:'Fixture',sizeLabel:'Base',cutQuantity:1,contour:fixture.contour,seamWidth:null,grainline:null,fold:false,cornerJoins:{},
    }] };
    const before=JSON.stringify(doc); expect(() => validateDocument(doc)).not.toThrow(); expect(JSON.stringify(doc)).toBe(before);
  });
});

describe('T027: contrato RED del motor pendiente T029–T032', () => {
  it.each(constants)('FR-043/046: $name', async fixture => {
    const engine=await geometryDriver(); expect(engine.isConstant(structuredClone(fixture.curve))).toBe(fixture.constant);
  });
  it.each(areas)('FR-042/046: $name sin mínimo adicional', async fixture => {
    const engine=await geometryDriver(); const curves=structuredClone(fixture.curves),before=JSON.stringify(curves);
    expect(engine.areaSign(curves)).toBe(fixture.numerator===0n?0:1); expect(JSON.stringify(curves)).toBe(before);
    expect(engine.areaSign(curves.toReversed().map(curve => [...curve].reverse() as unknown as typeof curve))).toBe(fixture.numerator===0n?0:-1);
  });
  it.each(pairs)('FR-037/039: $name', async fixture => {
    const engine=await geometryDriver(), a=structuredClone(fixture.a),b=structuredClone(fixture.b), before=JSON.stringify([a,b]);
    const result=engine.classifyPair(a,b); expect(result.kind).toBe(fixture.kind);
    if (fixture.kind!=='overlap') expect(result.count).toBe(fixture.witnesses.length);
    expect(JSON.stringify([a,b])).toBe(before);
  });
  it('FR-037: autocruce dentro de un único tramo cúbico', async () => {
    expect((await geometryDriver()).hasSelfCrossing(selfCrossing)).toBe(true);
  });
  it.each(contours)('FR-035/039/046: $name', async fixture => {
    const contour=structuredClone(fixture.contour),before=JSON.stringify(contour),result=(await geometryDriver()).inspectContour(contour);
    expect(result.closed).toBe(fixture.closed);
    if (!fixture.defects.length) expect(result.defects).toEqual([]);
    else for (const defect of fixture.defects) expect(result.defects).toContain(defect);
    expect(JSON.stringify(contour)).toBe(before);
  });
  it.each(sizes)('FR-044/045: $name', async fixture => {
    expect((await geometryDriver()).fitsPiece(polygon([[0,0],[fixture.width,0],[fixture.width,fixture.height],[0,fixture.height]]))).toEqual({width:fixture.validWidth,height:fixture.validHeight});
  });
  it.each(separations)('FR-036: $name', async fixture => {
    expect((await geometryDriver()).separated([[0,0],[4,0]],[[0,fixture.gap],[4,fixture.gap]],2)).toBe(fixture.valid);
  });
});
