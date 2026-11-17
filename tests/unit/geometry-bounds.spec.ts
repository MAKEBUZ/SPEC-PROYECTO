import { describe, it, expect } from 'vitest';
import { contourDimensions, approximateMargin, evaluateMargin } from '../../packages/geometry/src/bounds.js';
import { polygon } from '../geometry/fixtures.js';
import { createPiece } from '../../packages/document/src/piece.js';
import { rational as q, compare,add,subtract,multiply } from '../../packages/geometry/src/numeric.js';
import { validateOffset } from '../../packages/geometry/src/offset.js';
describe('T034 certified dimensions and approximation',()=>{
  it.each([false,true])('certifies concave winding with collinear extreme-side vertices (reversed=%s)',reversed=>{
    const points:[number,number][]=[[0,0],[8,0],[8,8],[5,8],[5,3],[3,3],[3,8],[0,8],[0,4]];
    if(reversed)points.reverse();
    const piece=createPiece('80000000-0000-4000-8000-000000000001',polygon(points));piece.seamWidth=.25;
    const result=approximateMargin(piece);expect(result.kind).toBe('certified');
    if(result.kind!=='certified')throw Error('Expected certification');
    // Independent shoelace oracle on this small rational polygon.
    const twiceArea=result.segments.reduce((sum,s)=>add(sum,subtract(multiply(s.start.x,s.end.y),multiply(s.start.y,s.end.x))),q(0n));
    expect(compare(twiceArea,q(0n))).toBe(reversed?-1:1);
  });
  it('reuses certification only for its captured snapshot',()=>{
    const piece=createPiece('80000000-0000-4000-8000-000000000001',polygon([[0,0],[4,0],[4,4],[0,4]]));piece.seamWidth=1;
    const captured=evaluateMargin(piece),expected=approximateMargin(piece);
    piece.contour.segments.pop();piece.seamWidth=200;
    expect(captured.approximate()).toEqual(expected);
    expect(evaluateMargin(piece).validation.kind).toBe('invalid-base');
  });
  it('checks actual cubic extrema, not the control box',()=>{
    const contour=polygon([[0,0]]),id=contour.points[0]!.id;
    const result=contourDimensions({points:contour.points,segments:[{id:'90000000-0000-4000-8000-000000000001',kind:'cubic',startId:id,endId:id,handleStart:{x:6000,y:0},handleEnd:{x:0,y:6000}}]});
    expect(result.widthWithinLimit).toBe(true);expect(result.heightWithinLimit).toBe(true);
    expect(result.field.compare(result.width,result.field.fromRational(q(8000n,3n)))).toBe(0);
  });
  it('keeps the inclusive limit and identifies each exceeded dimension',()=>{
    const result=contourDimensions(polygon([[0,0],[5000,0],[5000,5000],[0,5000]]));
    expect(result.widthWithinLimit&&result.heightWithinLimit).toBe(true);
    expect(contourDimensions(polygon([[0,0],[5000+2**-30,0],[5000+2**-30,4],[0,4]])).exceeded).toEqual(['width']);
  });
  it('certifies mixed miter/round margins over their entire trajectories',()=>{
    const piece=createPiece('80000000-0000-4000-8000-000000000001',polygon([[0,0],[4,0],[4,4],[0,4]]));
    piece.seamWidth=1;piece.cornerJoins[piece.contour.points[0]!.id]='round';
    const before=JSON.stringify(piece),result=approximateMargin(piece);
    expect(result.kind).toBe('certified');if(result.kind!=='certified')throw new Error('Expected certification');
    expect(result.topology).toBe('preserved');expect(result.segments.length).toBeGreaterThan(4);
    expect(result.segments.every(s=>compare(s.errorUpper,q(1n,100n))<=0)).toBe(true);
    expect(JSON.stringify(piece)).toBe(before);
  });
  it('does not merge a positive subnormal-scale margin with its base',()=>{
    const d=2**-600,piece=createPiece('80000000-0000-4000-8000-000000000001',polygon([[0,0],[d,0],[d,d],[0,d]]));piece.seamWidth=d;
    const result=approximateMargin(piece);expect(result.kind).toBe('certified');
    if(result.kind==='certified')expect(result.segments).toHaveLength(4);
  });
  it('bounds a positive cubic offset and allows a stricter requested tolerance',()=>{
    const piece=createPiece('80000000-0000-4000-8000-000000000001',polygon([[0,0],[6,0],[6,4],[0,4]]));
    piece.contour.segments[0]={...piece.contour.segments[0]!,kind:'cubic',handleStart:{x:2,y:-2},handleEnd:{x:4,y:-2}};
    piece.seamWidth=.25;
    const coarse=approximateMargin(piece),fine=approximateMargin(piece,q(1n,1000n));
    expect(coarse.kind).toBe('certified');expect(fine.kind).toBe('certified');
    if(coarse.kind==='certified'&&fine.kind==='certified'){
      expect(fine.segments.length).toBeGreaterThan(coarse.segments.length);
      expect(fine.segments.every(s=>compare(s.errorUpper,q(1n,1000n))<=0)).toBe(true);
      // Independent analytic parabola: B(t)=(6t,6t²-6t), normal
      // (12t-6,-6)/sqrt(36+(12t-6)²). This supplements (not replaces)
      // the whole-interval certificate with a regression oracle.
      const n=(r:{n:bigint;d:bigint})=>Number(r.n)/Number(r.d);
      for(const s of fine.segments.filter(s=>s.sourceId===piece.contour.segments[0]!.id))for(const u of [.2,.5,.8]){
        const t=n(s.parameterFrom)*(1-u)+n(s.parameterTo)*u,d=12*t-6,speed=Math.hypot(6,d);
        const x=6*t+.25*d/speed,y=6*t*t-6*t-1.5/speed;
        const px=n(s.start.x)*(1-u)+n(s.end.x)*u,py=n(s.start.y)*(1-u)+n(s.end.y)*u;
        expect(Math.hypot(x-px,y-py)).toBeLessThanOrEqual(n(s.errorUpper)+1e-12);
      }
    }
  },120000);
  it('reports actual exceeded values including the margin',()=>{
    const piece=createPiece('80000000-0000-4000-8000-000000000001',polygon([[0,0],[4999,0],[4999,4],[0,4]]));piece.seamWidth=1;
    const result=validateOffset(piece);expect(result.kind).toBe('invalid-margin');
    if(result.kind==='invalid-margin'){
      expect(result.dimensions?.exceeded).toEqual(['width']);
      const d=result.dimensions!;expect(d.field.compare(d.width,d.field.number(5001))).toBe(0);
    }
  });
  it('preserves clockwise traversal, exact shared vertices and deterministic output',()=>{
    const piece=createPiece('80000000-0000-4000-8000-000000000001',polygon([[0,0],[0,4],[4,4],[4,0]]));piece.seamWidth=.5;
    piece.cornerJoins[piece.contour.points[0]!.id]='round';
    const a=approximateMargin(piece),b=approximateMargin(piece);expect(a.kind).toBe('certified');
    if(a.kind==='certified'&&b.kind==='certified'){
      expect(a.segments).toEqual(b.segments);
      for(let i=0;i<a.segments.length;i++)expect(a.segments[i]!.end).toEqual(a.segments[(i+1)%a.segments.length]!.start);
    }
  });
  it('does not replace exact dimensions by rounded approximation dimensions at 5000 mm',()=>{
    const piece=createPiece('80000000-0000-4000-8000-000000000001',polygon([[0,0],[4998,0],[4998,4],[0,4]]));piece.seamWidth=1;
    const result=approximateMargin(piece);expect(result.kind).toBe('certified');
    if(result.kind==='certified')expect(result.dimensions.field.compare(result.dimensions.width,result.dimensions.field.number(5000))).toBe(0);
  });
  it('keeps a tiny closed cubic at zero margin without a minimum feature size',()=>{
    const d=2**-200,piece=createPiece('80000000-0000-4000-8000-000000000001',polygon([[0,0]])),id=piece.contour.points[0]!.id;
    piece.contour.segments=[{id:'90000000-0000-4000-8000-000000000001',kind:'cubic',startId:id,endId:id,handleStart:{x:d,y:0},handleEnd:{x:0,y:d}}];
    piece.seamWidth=0;
    const result=approximateMargin(piece);expect(result.kind).toBe('certified');
    if(result.kind==='certified')expect(result.segments.length).toBeGreaterThan(3);
  });
  it('approximates coincident cubic margins and rejects invalid margins without mutation',()=>{
    const piece=createPiece('80000000-0000-4000-8000-000000000001',polygon([[0,0],[6,0],[6,4],[0,4]]));
    piece.contour.segments[0]={...piece.contour.segments[0]!,kind:'cubic',handleStart:{x:2,y:-2},handleEnd:{x:4,y:-2}};
    piece.seamWidth=0;expect(approximateMargin(piece).kind).toBe('certified');
    piece.seamWidth=3000;expect(approximateMargin(piece).kind).toBe('invalid-margin');
    expect(()=>approximateMargin(piece,q(1n))).toThrow('INVALID_APPROXIMATION_TOLERANCE');
  },120000);
});
