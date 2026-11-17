import { isConstant, pathIntegral } from '../../packages/geometry/src/contour-validation.js';
import { compare, rational } from '../../packages/geometry/src/numeric.js';
import type { GeometryDriver } from './geometry-driver.js';
import { classifyPair, selfIntersections, inspectContour } from '../../packages/geometry/src/intersections.js';
import { contourDimensions } from '../../packages/geometry/src/bounds.js';
import {AlgebraicContext} from '../../packages/geometry/src/algebraic.js';
import {lineDistanceSquared} from '../../packages/print/src/separation.js';
import type {Curve} from '../geometry/fixtures.js';
const pending=(task:string):never=>{throw new Error(`GEOMETRY_NOT_IMPLEMENTED: pendiente ${task}`);};
export const geometryDriver:GeometryDriver={
  isConstant:curve=>isConstant(curve.map(([x,y])=>({x,y}))),
  areaSign:curves=>compare(pathIntegral(curves.map(curve=>curve.map(([x,y])=>({x,y})))),rational(0n)),
  classifyPair:(a,b)=>classifyPair(a.map(([x,y])=>({x,y})),b.map(([x,y])=>({x,y}))),
  hasSelfCrossing:curve=>selfIntersections(curve.map(([x,y])=>({x,y}))).events.some(e=>e.kind==='crossing'),
  inspectContour,
  fitsPiece:contour=>{const result=contourDimensions(contour);return {width:result.widthWithinLimit,height:result.heightWithinLimit};},
  separated:(a,b,minimum)=>{
    if(a.length!==2||b.length!==2)return pending('separación exacta de curvas');
    const f=new AlgebraicContext(),line=(c:Curve)=>({kind:'line' as const,sourceId:'test',start:{x:f.number(c[0][0]),y:f.number(c[0][1])},end:{x:f.number(c[1][0]),y:f.number(c[1][1])}});
    return f.compare(lineDistanceSquared(f,line(a),line(b)),f.square(f.number(minimum)))>=0;
  },
};
