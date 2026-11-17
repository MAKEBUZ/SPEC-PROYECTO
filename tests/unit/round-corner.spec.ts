import {it,expect} from 'vitest';
import {roundCorner} from '../../packages/geometry/src/round-corner.js';
import {CadTools} from '../../apps/desktop/src/renderer/cad/tools.js';
import {hasExplicitClosure} from '../../packages/geometry/src/model.js';
import {inspectContour} from '../../packages/geometry/src/intersections.js';

it.each([1,-1])('creates tangent corners in either winding (%s)',sign=>{
 const result=roundCorner({x:0,y:0},{x:100,y:0},{x:100,y:sign*100},10);
 expect(result.start).toEqual({x:90,y:0});expect(result.arcs.at(-1)!.end.x).toBeCloseTo(100,12);expect(result.arcs.at(-1)!.end.y).toBeCloseTo(sign*10,12);
 expect(result.arcs[0]!.handleStart.y).toBeCloseTo(0,12);expect(result.arcs.at(-1)!.handleEnd.x).toBeCloseTo(100,12);
 for(const arc of result.arcs)for(let i=0;i<=20;i++){
  const t=i/20,u=1-t,x=u**3*arc.start.x+3*u*u*t*arc.handleStart.x+3*u*t*t*arc.handleEnd.x+t**3*arc.end.x;
  const y=u**3*arc.start.y+3*u*u*t*arc.handleStart.y+3*u*t*t*arc.handleEnd.y+t**3*arc.end.y;
  expect(Math.abs(Math.hypot(x-90,y-sign*10)-10)).toBeLessThan(.01);
 }
});
it.each([0,1,2,3])('rounds corner %s atomically, preserving closure, metadata and undo/redo',index=>{
 const tools=new CadTools();tools.draw([[0,0],[100,0],[100,100],[0,100]]);tools.closeContour();tools.margin(3);
 const before=tools.document(),p=tools.piece();tools.roundPieceCorner(p.contour.points[index]!.id,10);
 const after=tools.document();expect(hasExplicitClosure(tools.piece().contour)).toBe(true);expect(tools.piece().contour.segments).toHaveLength(5);
 expect(inspectContour(tools.piece().contour).defects).toEqual([]);
 expect(tools.piece().seamWidth).toBe(3);expect(tools.piece().id).toBe(p.id);expect(tools.piece().name).toBe(p.name);
 tools.undo();expect(tools.document()).toEqual(before);tools.redo();expect(tools.document()).toEqual(after);
});
it.each([0,-1,NaN,Infinity,100,1000])('rejects radius %s without modifying the document',radius=>{
 const tools=new CadTools();tools.draw([[0,0],[100,0],[100,100]]);const before=tools.document();
 expect(()=>tools.roundPieceCorner(tools.piece().contour.points[1]!.id,radius)).toThrow();expect(tools.document()).toEqual(before);
});
it('rejects curve junctions and open endpoints without changing history',()=>{
 const tools=new CadTools();tools.draw([[0,0],[100,0],[100,100]]);tools.curve(0);const before=tools.document();
 for(const point of tools.piece().contour.points)expect(()=>tools.roundPieceCorner(point.id,10)).toThrow('dos tramos rectos');
 expect(tools.document()).toEqual(before);
});
it('rounds a concave corner while preserving the connected boundary',()=>{
 const tools=new CadTools();tools.draw([[0,0],[100,0],[100,100],[50,50],[0,100]]);tools.closeContour();
 tools.roundPieceCorner(tools.piece().contour.points[3]!.id,5);expect(hasExplicitClosure(tools.piece().contour)).toBe(true);
});
