import { describe, it, expect } from 'vitest';
import { AlgebraicContext } from '../../packages/geometry/src/algebraic.js';
import { intersectOffsetLine, trimOffsetLineCorner, evaluateDerivedOffset, splitStationaryOffset } from '../../packages/geometry/src/offset-intersections.js';
import { rational as q } from '../../packages/geometry/src/numeric.js';
import type { DerivedLine } from '../../packages/geometry/src/derived-path.js';
describe('actual curved offset intersections',()=>{
  it('finds a known exact contact without substituting the tangent support',()=>{
    const f=new AlgebraicContext(),curve={controls:[{x:0,y:0},{x:1,y:0},{x:2,y:.75},{x:3,y:2.25}],width:1.25,winding:1 as const};
    const line:DerivedLine={kind:'line',sourceId:'line',start:{x:f.number(2.25),y:f.number(3)},end:{x:f.number(2.25),y:f.number(-3)}};
    const hits=intersectOffsetLine(f,curve,line);
    expect(hits).toHaveLength(1);expect(f.compare(hits[0]!.curveParameter,f.fromRational(q(1n,2n)))).toBe(0);
    expect(f.compare(hits[0]!.point.y,f.fromRational(q(-7n,16n)))).toBe(0);
    expect(trimOffsetLineCorner(f,curve,line,true)).not.toBeNull();
  });
  it('rejects roots introduced by squaring the signed normal equation',()=>{
    const f=new AlgebraicContext(),curve={controls:[{x:0,y:0},{x:1,y:0},{x:2,y:.75},{x:3,y:2.25}],width:1.25,winding:1 as const};
    const line:DerivedLine={kind:'line',sourceId:'line',start:{x:f.number(-.5),y:f.number(-3)},end:{x:f.number(-.5),y:f.number(3)}};
    expect(intersectOffsetLine(f,curve,line)).toEqual([]);
  });
  it('extends the normal continuously through an even stationary zero',()=>{
    const f=new AlgebraicContext(),point=evaluateDerivedOffset(f,{controls:[{x:-1,y:0},{x:1,y:0},{x:-1,y:0},{x:1,y:0}],width:2,winding:1},f.fromRational(q(1n,2n)));
    expect(f.sign(point.x)).toBe(0);expect(f.compare(point.y,f.number(-2))).toBe(0);
  });
  it('splits a cusp and retains its different one-sided limits',()=>{
    const f=new AlgebraicContext(),result=splitStationaryOffset(f,{controls:[{x:.75,y:-.375},{x:-.25,y:.375},{x:-.25,y:-.375},{x:.75,y:.375}],width:2,winding:1});
    expect(result.intervals).toHaveLength(2);expect(result.breaks).toHaveLength(1);
    const b=result.breaks[0]!;expect(b.continuous).toBe(false);expect(b.order).toBe(1);
    expect(f.compare(b.left!.y,f.number(2))).toBe(0);expect(f.compare(b.right!.y,f.number(-2))).toBe(0);
  });
  it('retains a continuous stationary point without adding a minimum length',()=>{
    const f=new AlgebraicContext(),result=splitStationaryOffset(f,{controls:[{x:-1,y:0},{x:1,y:0},{x:-1,y:0},{x:1,y:0}],width:2**-600,winding:1});
    expect(result.intervals).toHaveLength(2);expect(result.breaks[0]!.continuous).toBe(true);expect(result.breaks[0]!.order).toBe(2);
  });
});
