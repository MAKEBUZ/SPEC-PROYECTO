import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Curve, Contour } from '../geometry/fixtures.js';

// Test port, not a substitute kernel. T031/T032 bind their real exports here.
// Missing implementation fails explicitly rather than skipping or returning
// expected fixture values. Adapt signatures here when the model is introduced.
export interface GeometryDriver {
  isConstant(curve: Curve): boolean;
  areaSign(curves: Curve[]): -1|0|1;
  classifyPair(a: Curve,b: Curve): { kind: string; count?: number };
  hasSelfCrossing(curve: Curve): boolean;
  inspectContour(contour: Contour): { closed: boolean; defects: string[] };
  fitsPiece(contour: Contour): { width: boolean; height: boolean };
  separated(a: Curve,b: Curve,minimum: number): boolean;
}
export async function geometryDriver(): Promise<GeometryDriver> {
  const path=resolve('tests/support/geometry-binding.ts');
  if (!existsSync(path)) throw new Error('GEOMETRY_NOT_IMPLEMENTED: conectar el motor real de T029–T032 mediante test-driver; no usar el oráculo como implementación.');
  const module = await import(/* @vite-ignore */ pathToFileURL(path).href) as { geometryDriver: GeometryDriver };
  const driver=module.geometryDriver;
  for (const method of ['isConstant','areaSign','classifyPair','hasSelfCrossing','inspectContour','fitsPiece','separated'] as const) if (typeof driver?.[method] !== 'function') throw new Error(`Falta el predicado real ${method}`);
  return driver;
}
