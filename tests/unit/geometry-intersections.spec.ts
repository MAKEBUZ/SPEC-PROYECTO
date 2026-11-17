import { describe, it, expect } from 'vitest';
import { classifyPair, intersectCurves, selfIntersections, inspectContour } from '../../packages/geometry/src/intersections.js';
import type { Coordinate, Contour } from '../../packages/geometry/src/model.js';
import { pairs, selfCrossing, parabola, polygon } from '../geometry/fixtures.js';
const c=(p:readonly (readonly [number,number])[])=>p.map(([x,y])=>({x,y}));
function halves(p:Coordinate[]):[Coordinate[],Coordinate[]]{
  const mid=(a:Coordinate,b:Coordinate)=>({x:(a.x+b.x)/2,y:(a.y+b.y)/2});
  const a=mid(p[0]!,p[1]!),b=mid(p[1]!,p[2]!),d=mid(p[2]!,p[3]!),e=mid(a,b),f=mid(b,d),g=mid(e,f);
  return [[p[0]!,a,e,g],[g,f,d,p[3]!]];
}
describe('T032 exact intersections',()=>{
  it.each(pairs)('$name also with argument order reversed',fixture=>{
    const result=classifyPair(c(fixture.b),c(fixture.a));expect(result.kind).toBe(fixture.kind);
    if(fixture.kind!=='overlap')expect(result.count).toBe(fixture.witnesses.length);
  });
  it('isolates irrational crossing parameters',()=>{
    expect(classifyPair(c([[0,0],[1,0],[2,1],[3,3]]),c([[0,1],[3,1]]))).toEqual({kind:'crossing',count:1});
  });
  it('eliminates a degree-nine cubic/cubic system and rejects complex roots',()=>{
    // t=2u^3 and u=2t^3: origin plus t=u=1/sqrt(2) on [0,1].
    expect(classifyPair(c([[0,0],[1,0],[2,0],[3,6]]),c([[0,0],[0,1],[0,2],[6,3]]))).toEqual({kind:'crossing',count:2});
  });
  it('solves a fibre with two distinct parameters at the same point',()=>{
    expect(classifyPair(c(selfCrossing),c([[0,-2],[0,2]]))).toEqual({kind:'crossing',count:2});
  });
  it('handles irrational parameters on both curves without float matching',()=>{
    expect(classifyPair(c([[0,0],[0,0],[0,0],[3,0]]),c([[1,-1],[1,-1],[1,-1],[1,2]]))).toEqual({kind:'crossing',count:1});
  });
  it('preserves classifications under exact scale, translation and parameter reversal',()=>{
    for(const fixture of pairs)for(const factor of [2**-400,8]){
      const map=(p:readonly (readonly [number,number])[])=>c(p).map(({x,y})=>({x:(x+8)*factor,y:(y-4)*factor}));
      expect(classifyPair(map(fixture.a).toReversed(),map(fixture.b).toReversed()).kind).toBe(fixture.kind);
    }
  });
  it('detects odd order tangential crossings',()=>{
    expect(classifyPair(c([[-3,-1],[-1,1],[1,-1],[3,1]]),c([[-3,0],[3,0]]))).toEqual({kind:'crossing',count:1});
  });
  it('handles partial coincidence and adjacent portions without false overlap',()=>{
    const original=c(parabola),[left,right]=halves(original);
    expect(classifyPair(original,left).kind).toBe('overlap');
    expect(classifyPair(left.toReversed(),original).kind).toBe('overlap');
    expect(classifyPair(left,right)).toEqual({kind:'contact',count:1});
  });
  it('handles partial coincidence on a genuine cubic',()=>{
    const original=c(selfCrossing),[left]=halves(original);
    expect(classifyPair(original,left).kind).toBe('overlap');
    expect(classifyPair(left,original).kind).toBe('overlap');
  });
  it('detects the off-diagonal contact of adjacent self-crossing portions',()=>{
    const [left,right]=halves(c(selfCrossing));
    expect(intersectCurves(left,right).events).toHaveLength(2);
  });
  it('finds collinear retracing but not a stationary monotonic path',()=>{
    expect(selfIntersections(c([[0,0],[4,0],[-4,0],[0,0]])).overlap).toBe(true);
    expect(selfIntersections(c([[-1,0],[1,0],[-1,0],[1,0]])).overlap).toBe(false);
    expect(classifyPair(c([[0,0],[4,0],[-4,0],[0,0]]),c([[0,0],[1,0]])).kind).toBe('overlap');
  });
  it('a constant trajectory is a point contact, never a positive overlap',()=>{
    expect(classifyPair(c([[1,0],[1,0]]),c([[0,0],[2,0]]))).toEqual({kind:'contact',count:1});
    expect(classifyPair(c([[0,0],[0,0]]),c([[1,0],[1,0]]))).toEqual({kind:'none',count:0});
    expect(classifyPair(c([[0,0],[0,0]]),c([[0,0],[0,0]]))).toEqual({kind:'contact',count:1});
  });
  it('accepts the ordinary closure of a one-segment cubic loop',()=>{
    const contour:Contour=polygon([[0,0]]),id=contour.points[0]!.id;
    contour.segments=[{id:'90000000-0000-4000-8000-000000000001',kind:'cubic',startId:id,endId:id,handleStart:{x:4,y:0},handleEnd:{x:0,y:4}}];
    expect(inspectContour(contour)).toEqual({closed:true,defects:[]});
  });
  it('does not mutate inputs or silently accept invalid controls',()=>{
    const a=c(parabola),b=c([[-3,0],[3,0]]),before=JSON.stringify([a,b]);intersectCurves(a,b);
    expect(JSON.stringify([a,b])).toBe(before);
    expect(()=>intersectCurves([{x:NaN,y:0},{x:1,y:1}],b)).toThrow();
  });
});
