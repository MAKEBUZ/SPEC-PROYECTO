import { it,expect } from 'vitest';
import { polygon } from './fixtures.js';
import { createPiece } from '../../packages/document/src/piece.js';
import { approximateMargin } from '../../packages/geometry/src/bounds.js';
import { validateOffset } from '../../packages/geometry/src/offset.js';
import { rational as q,compare } from '../../packages/geometry/src/numeric.js';
const id='80000000-0000-4000-8000-000000000001';
it.each([2**-100,1,128])('certifies the whole mixed boundary at scale %s without altering draft geometry',scale=>{
  for(const reversed of [false,true]){
    const points:[[number,number],[number,number],[number,number],[number,number]]=[[0,0],[4*scale,0],[4*scale,3*scale],[0,3*scale]],p=createPiece(id,polygon(reversed?points.reverse():points));p.seamWidth=scale/4;p.cornerJoins[p.contour.points[0]!.id]='round';
    const before=JSON.stringify(p),result=approximateMargin(p);expect(result.kind).toBe('certified');if(result.kind!=='certified')throw new Error('No certified margin');
    expect(result.topology).toBe('preserved');expect(result.segments.every(s=>compare(s.errorUpper,q(1n,100n))<=0)).toBe(true);
    const f=result.dimensions.field;expect(f.compare(result.dimensions.width,f.number(4.5*scale))).toBe(0);expect(f.compare(result.dimensions.height,f.number(3.5*scale))).toBe(0);
    for(let i=0;i<result.segments.length;i++)expect(result.segments[i]!.end).toEqual(result.segments[(i+1)%result.segments.length]!.start);
    expect(JSON.stringify(p)).toBe(before);
  }
},120000);
it('retains a valid long miter and rejects only when the existing size bound is exceeded',()=>{
  const valid=createPiece(id,polygon([[0,0],[100,0],[0,1]]));valid.seamWidth=1;
  const a=approximateMargin(valid);expect(a.kind).toBe('certified');if(a.kind!=='certified')throw new Error('No certified miter');expect(a.dimensions.field.compare(a.dimensions.width,a.dimensions.field.number(200))).toBe(1);
  const invalid=createPiece(id,polygon([[0,0],[100,0],[0,.001]]));invalid.seamWidth=1;const before=JSON.stringify(invalid),b=validateOffset(invalid);expect(b.kind).toBe('invalid-margin');if(b.kind==='invalid-margin')expect(b.dimensions?.exceeded).toContain('width');expect(JSON.stringify(invalid)).toBe(before);
},120000);
it('retains invalid self-crossing draft geometry and never substitutes a repaired margin',()=>{
  const p=createPiece(id,polygon([[0,0],[6,4],[0,4],[4,0]]));p.seamWidth=3;const before=JSON.stringify(p);expect(approximateMargin(p).kind).toBe('invalid-base');expect(JSON.stringify(p)).toBe(before);
});
