import { describe, expect, it } from 'vitest';
import { buildOffset, evaluateOffset, endpointTangent } from '../../packages/geometry/src/offset.js';
import { constructJoin, joinGeometry } from '../../packages/geometry/src/joins.js';
import { createPiece } from '../../packages/document/src/piece.js';
import { polygon } from '../geometry/fixtures.js';
import { rational as q } from '../../packages/geometry/src/numeric.js';
const piece=()=>createPiece('80000000-0000-4000-8000-000000000001',polygon([[0,0],[4,0],[4,4],[0,4]]));
describe('T033 derived seam construction',()=>{
  it('distinguishes absent and zero margins without changing the document',()=>{
    const p=piece(),before=JSON.stringify(p);
    expect(buildOffset(p).kind).toBe('absent');expect(JSON.stringify(p)).toBe(before);
    p.seamWidth=0;expect(buildOffset(p).kind).toBe('coincident');
  });
  it('constructs mixed corner joins and preserves requested settings',()=>{
    const p=piece();p.seamWidth=1;p.cornerJoins[p.contour.points[0]!.id]='round';const before=JSON.stringify(p);
    const result=buildOffset(p);expect(result.kind).toBe('candidate');
    if(result.kind!=='candidate')throw new Error('Expected candidate');
    expect(result.joins.map(j=>j.kind)).toEqual(['miter','miter','miter','round']);
    expect(result.validation).toBe('pending');expect(JSON.stringify(p)).toBe(before);
  });
  it('offsets a straight support to the exterior in either traversal',()=>{
    for(const winding of [1,-1] as const){
      const controls=winding===1?[{x:0,y:0},{x:4,y:0}]:[{x:4,y:0},{x:0,y:0}];
      const result=evaluateOffset(controls,1,winding,q(1n,2n));
      expect(result.field.sign(result.field.sub(result.x,result.field.fromRational(q(2n))))).toBe(0);
      expect(result.field.sign(result.field.add(result.y,result.field.one))).toBe(0);
    }
  });
  it('keeps invalid base and requested width instead of repairing them',()=>{
    const p=piece();p.seamWidth=3;p.contour=polygon([[0,0],[6,4],[0,4],[4,0]]);const before=JSON.stringify(p);
    expect(buildOffset(p).kind).toBe('invalid-base');expect(JSON.stringify(p)).toBe(before);
  });
  it('rejects negative and nonfinite widths',()=>{
    for(const width of [-1,NaN,Infinity]){const p=piece();p.seamWidth=width;expect(()=>buildOffset(p)).toThrow();}
  });
  it('preserves an arbitrarily long miter without truncating it',()=>{
    const join=constructJoin({vertexId:'corner',vertex:{x:0,y:0},incoming:{x:q(1n),y:q(0n)},outgoing:{x:q(-1n),y:q(1n,1n<<40n)},width:1,winding:1,style:'miter'});
    const g=joinGeometry(join);expect(g.supportIntersection).not.toBeNull();
    expect(g.field.sign(g.field.sub(g.supportIntersection!.x,g.field.fromRational(q(5000n))))).toBe(1);
  });
  it('constructs round endpoints at exactly the requested radius',()=>{
    const join=constructJoin({vertexId:'corner',vertex:{x:2,y:3},incoming:{x:q(3n),y:q(2n)},outgoing:{x:q(-1n),y:q(2n)},width:7,winding:1,style:'round'});
    const g=joinGeometry(join),f=g.field;
    for(const point of [g.start,g.end]){
      const dx=f.sub(point.x,g.center.x),dy=f.sub(point.y,g.center.y);
      expect(f.sign(f.sub(f.add(f.mul(dx,dx),f.mul(dy,dy)),f.fromRational(q(49n))))).toBe(0);
    }
  });
  it('classifies concavity independently of the requested convex join',()=>{
    for(const style of ['round','miter'] as const){
      expect(constructJoin({vertexId:'corner',vertex:{x:0,y:0},incoming:{x:q(1n),y:q(0n)},outgoing:{x:q(0n),y:q(-1n)},width:1,winding:1,style}).kind).toBe('concave');
    }
  });
  it('uses one-sided tangents when endpoint speed is zero',()=>{
    const c=[{x:0,y:0},{x:0,y:0},{x:4,y:0},{x:4,y:0}];
    expect(endpointTangent(c,0).x.n>0n).toBe(true);expect(endpointTangent(c,1).x.n>0n).toBe(true);
    const g=evaluateOffset(c,1,1,q(1n));expect(g.field.sign(g.field.add(g.y,g.field.one))).toBe(0);
  });
  it('does not divide by speed zero at an interior stationary parameter',()=>{
    const c=[{x:-1,y:0},{x:1,y:0},{x:-1,y:0},{x:1,y:0}];
    const positive=evaluateOffset(c,1,1,q(1n,2n));expect(positive.field.sign(positive.field.add(positive.y,positive.field.one))).toBe(0);
    const cusp=[{x:.75,y:-.375},{x:-.25,y:.375},{x:-.25,y:-.375},{x:.75,y:.375}];
    expect(()=>evaluateOffset(cusp,1,1,q(1n,2n))).toThrow('ONE_SIDED_LIMIT');
    const zero=evaluateOffset(c,0,1,q(1n,2n));expect(zero.field.sign(zero.x)).toBe(0);
  });
  it('evaluates a curved offset with exact distance from its base point',()=>{
    const c=[{x:0,y:0},{x:1,y:0},{x:2,y:1},{x:3,y:3}],g=evaluateOffset(c,2,1,q(1n,2n)),f=g.field;
    const dx=f.sub(g.x,f.fromRational(q(3n,2n))),dy=f.sub(g.y,f.fromRational(q(3n,4n)));
    expect(f.sign(f.sub(f.add(f.mul(dx,dx),f.mul(dy,dy)),f.fromRational(q(4n))))).toBe(0);
  });
});
