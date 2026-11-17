import { describe, expect, it } from 'vitest';
import { AlgebraicContext } from '../../packages/geometry/src/algebraic.js';
import { intersectOffsetCurves, CoincidentOffsetError } from '../../packages/geometry/src/offset-intersections.js';
import { eliminate } from '../../packages/geometry/src/elimination.js';
import { rational as q } from '../../packages/geometry/src/numeric.js';
import { evaluate, rationals as Q } from '../../packages/geometry/src/polynomials.js';
describe('offset pair polynomial elimination',()=>{
  it('supports elimination beyond cubic Sylvester matrices',()=>{
    const r=eliminate([[q(0n),q(-1n)],[q(1n)]],[[q(-2n)],[],[],[],[],[],[],[q(1n)]]);
    expect(evaluate(r,q(2n),Q)).toEqual(q(126n));
  });
  it('finds an analytical intersection of two positive parabolic offsets',()=>{
    const f=new AlgebraicContext();
    const a={controls:[{x:-3,y:3},{x:-1,y:-1},{x:1,y:-1},{x:3,y:3}],width:1,winding:1 as const};
    const b={controls:[{x:-4,y:-4},{x:0,y:-2},{x:0,y:0},{x:-4,y:2}],width:1,winding:1 as const};
    const hits=intersectOffsetCurves(f,a,b);
    expect(hits).toHaveLength(1);
    expect(hits.some(h=>f.sign(h.point.x)===0&&f.compare(h.point.y,f.number(-1))===0)).toBe(true);
  },60000);
  it('retains the ordinary contact between adjacent parts of the same curve',()=>{
    const f=new AlgebraicContext(),a={controls:[{x:-3,y:3},{x:-2,y:1},{x:-1,y:0},{x:0,y:0}],width:.25,winding:1 as const};
    const b={controls:[{x:0,y:0},{x:1,y:0},{x:2,y:1},{x:3,y:3}],width:.25,winding:1 as const};
    const hits=intersectOffsetCurves(f,a,b);expect(hits).toHaveLength(1);
    expect(f.compare(hits[0]!.incomingParameter,f.one)).toBe(0);expect(f.sign(hits[0]!.outgoingParameter)).toBe(0);
  },60000);
  it('reports coincident positive offsets as geometry, not an empty hit set',()=>{
    const f=new AlgebraicContext(),a={controls:[{x:-3,y:3},{x:-1,y:-1},{x:1,y:-1},{x:3,y:3}],width:.25,winding:1 as const};
    expect(()=>intersectOffsetCurves(f,a,a)).toThrow(CoincidentOffsetError);
    expect(()=>intersectOffsetCurves(f,{...a,width:0},a)).toThrow('POSITIVE_OFFSET_PAIR_REQUIRED');
  });
});
