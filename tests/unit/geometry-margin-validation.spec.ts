import { describe, expect, it } from 'vitest';
import { validateOffset, resolveConcaveOffsets } from '../../packages/geometry/src/offset.js';
import { polygon } from '../geometry/fixtures.js';
import { createPiece } from '../../packages/document/src/piece.js';
const make=(points:readonly (readonly [number,number])[],width:number)=>{
  const p=createPiece('80000000-0000-4000-8000-000000000001',polygon(points));p.seamWidth=width;return p;
};
describe('T033 concave trimming and global margin validation',()=>{
  it('trims only the adjacent ends of an L shape',()=>{
    const p=make([[0,0],[6,0],[6,2],[2,2],[2,6],[0,6]],1),before=JSON.stringify(p),result=validateOffset(p);
    expect(result.kind).toBe('validated');
    if(result.kind!=='validated')throw new Error('Expected validated margin');
    expect(result.trims).toHaveLength(1);expect(result.widthWithinLimit).toBe(true);expect(result.heightWithinLimit).toBe(true);
    expect(JSON.stringify(p)).toBe(before);
  });
  it('rejects a notch consumed by the margin without global repair',()=>{
    const p=make([[0,0],[8,0],[8,8],[5,8],[5,2],[3,2],[3,8],[0,8]],2),before=JSON.stringify(p);
    expect(validateOffset(p).kind).toBe('invalid-margin');expect(JSON.stringify(p)).toBe(before);
  });
  it('validates mixed exact circular arcs and straight pieces',()=>{
    const p=make([[0,0],[4,0],[4,4],[0,4]],1);p.cornerJoins[p.contour.points[0]!.id]='round';
    const result=validateOffset(p);expect(result.kind).toBe('validated');
    if(result.kind==='validated')expect(result.path.filter(s=>s.kind==='arc')).toHaveLength(1);
  });
  it('checks the 5000 mm inclusive bound including the seam',()=>{
    expect(validateOffset(make([[0,0],[4998,0],[4998,4998],[0,4998]],1)).kind).toBe('validated');
    const result=validateOffset(make([[0,0],[4999,0],[4999,4],[0,4]],1));
    expect(result.kind).toBe('invalid-margin');
    if(result.kind==='invalid-margin')expect(result.defects).toContain('width-exceeded');
  });
  it('does not introduce a minimum for positive tiny pieces',()=>{
    const d=2**-600;expect(validateOffset(make([[0,0],[d,0],[d,d],[0,d]],d)).kind).toBe('validated');
  });
  it('preserves classification under traversal reversal',()=>{
    const points=[[0,0],[6,0],[6,2],[2,2],[2,6],[0,6]] as const;
    expect(validateOffset(make(points.toReversed(),1)).kind).toBe('validated');
  });
  it('resolves a concave line/Bézier corner on the actual offset',()=>{
    const p=make([[0,0],[6,0],[6,2],[2,2],[2,6],[0,6]],.25);
    const segment=p.contour.segments[2]!;
    p.contour.segments[2]={...segment,kind:'cubic',handleStart:{x:5,y:2},handleEnd:{x:4,y:1}};
    const before=JSON.stringify(p),result=resolveConcaveOffsets(p);
    expect(result.defects).toEqual([]);expect(result.trims).toHaveLength(1);
    const trim=result.trims[0]!,f=result.field;
    expect(f.compare(trim.point.x,f.number(2.25))).toBe(0);
    expect(f.sign(trim.incomingParameter)).toBe(1);expect(f.compare(trim.incomingParameter,f.one)).toBe(-1);
    expect(JSON.stringify(p)).toBe(before);
    expect(validateOffset(p).kind).toBe('validated');
  },120000);
  it('validates zero width on a cubic using its true extrema',()=>{
    const p=make([[0,0]],0),id=p.contour.points[0]!.id;
    p.contour.segments=[{id:'90000000-0000-4000-8000-000000000001',kind:'cubic',startId:id,endId:id,handleStart:{x:6000,y:0},handleEnd:{x:0,y:6000}}];
    expect(validateOffset(p).kind).toBe('validated-coincident');
  });
  it('handles irrational normals and all rounded corners',()=>{
    const p=make([[0,2],[2,0],[4,2],[2,4]],1);
    for(const id of Object.keys(p.cornerJoins))p.cornerJoins[id]='round';
    expect(validateOffset(p).kind).toBe('validated');
  });
  it('trims a Bézier–Bézier concavity and certifies the complete positive margin',()=>{
    // The two local offsets meet at parameters 7/8 and 1/4, at y=3.
    const p=make([[0,0],[6,0],[6,3],[0,3],[3,4.5],[3,9],[-3,9],[-3,0]],105/128);
    p.contour.segments[2]={...p.contour.segments[2]!,kind:'cubic',handleStart:{x:4,y:1},handleEnd:{x:2,y:1}};
    p.contour.segments[3]={...p.contour.segments[3]!,kind:'cubic',handleStart:{x:1,y:4},handleEnd:{x:2,y:4.5}};
    const before=JSON.stringify(p),result=validateOffset(p);
    expect(result.kind).toBe('validated');if(result.kind==='validated'){
      expect(result.trims).toHaveLength(1);expect(result.field.compare(result.trims[0]!.point.y,result.field.number(3))).toBe(0);
    }
    expect(JSON.stringify(p)).toBe(before);
  },180000);
  it('rejects the self-crossing positive offset of a simple parabola',()=>{
    const p=make([[-3,3],[3,3],[3,-3],[-3,-3]],2);
    p.contour.segments[0]={...p.contour.segments[0]!,kind:'cubic',handleStart:{x:-1,y:-1},handleEnd:{x:1,y:-1}};
    const before=JSON.stringify(p),result=validateOffset(p);
    expect(result.kind).toBe('invalid-margin');
    if(result.kind==='invalid-margin')expect(result.defects).toContain('self-contact-or-crossing');
    expect(JSON.stringify(p)).toBe(before);
  },180000);
  it('reports a retained cusp offset discontinuity without inventing a connector',()=>{
    const p=make([[.75,-.375],[.75,.375]],.1);
    p.contour.segments[0]={...p.contour.segments[0]!,kind:'cubic',handleStart:{x:-.25,y:.375},handleEnd:{x:-.25,y:-.375}};
    const result=validateOffset(p);expect(result.kind).toBe('invalid-margin');
    if(result.kind==='invalid-margin')expect(result.defects).toContain('discontinuous-stationary-offset');
  });
});
