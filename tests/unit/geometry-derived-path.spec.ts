import { describe, it, expect } from 'vitest';
import { AlgebraicContext } from '../../packages/geometry/src/algebraic.js';
import { primitiveIntersections, validateDerivedPath } from '../../packages/geometry/src/derived-path.js';
import type { DerivedArc, DerivedLine } from '../../packages/geometry/src/derived-path.js';
describe('exact derived line/arc topology',()=>{
  it('detects a line tangent to an arc',()=>{
    const f=new AlgebraicContext(),p=(x:number,y:number)=>({x:f.number(x),y:f.number(y)});
    const arc:DerivedArc={kind:'arc',sourceId:'a',center:p(0,0),radius:f.one,start:p(1,0),end:p(0,1),winding:1};
    const line:DerivedLine={kind:'line',sourceId:'b',start:p(-2,1),end:p(2,1)};
    const hits=primitiveIntersections(f,line,arc);expect(hits.overlap).toBe(false);expect(hits.points).toHaveLength(1);
    expect(f.sign(hits.points[0]!.x)).toBe(0);
  });
  it('distinguishes coincident arcs, ordinary endpoints and circle tangency',()=>{
    const f=new AlgebraicContext(),p=(x:number,y:number)=>({x:f.number(x),y:f.number(y)});
    const a:DerivedArc={kind:'arc',sourceId:'a',center:p(0,0),radius:f.one,start:p(1,0),end:p(0,1),winding:1};
    expect(primitiveIntersections(f,a,a).overlap).toBe(true);
    const b:DerivedArc={...a,start:p(0,1),end:p(-1,0)};
    expect(primitiveIntersections(f,a,b).overlap).toBe(false);
    const c:DerivedArc={...a,center:p(2,0),start:p(2,1),end:p(1,0)};
    expect(primitiveIntersections(f,a,c).points).toHaveLength(1);
  });
  it('blocks a nonadjacent crossing rather than accepting its algebraic area',()=>{
    const f=new AlgebraicContext(),points=[[0,0],[6,4],[0,4],[4,0]].map(([x,y])=>({x:f.number(x!),y:f.number(y!)}));
    const path:DerivedLine[]=points.map((start,i)=>({kind:'line',sourceId:String(i),start,end:points[(i+1)%points.length]!}));
    expect(validateDerivedPath(f,path).defects).toContain('self-contact-or-crossing');
  });
  it('includes interior circular extrema in bounds',()=>{
    const f=new AlgebraicContext(),p=(x:number,y:number)=>({x:f.number(x),y:f.number(y)});
    const h=f.sqrt(f.number(3)),start={x:f.div(f.one,f.number(2)),y:f.div(f.sub(f.zero,h),f.number(2))},end={x:start.x,y:f.div(h,f.number(2))};
    const arc:DerivedArc={kind:'arc',sourceId:'a',center:p(0,0),radius:f.one,start,end,winding:1};
    const result=validateDerivedPath(f,[arc,{kind:'line',sourceId:'b',start:end,end:start}]);
    expect(result.defects).toEqual([]);expect(f.compare(result.bounds!.maxX,f.one)).toBe(0);
  });
  it('preserves older values across new algebraic extensions',()=>{
    const f=new AlgebraicContext(),a=f.sqrt(f.number(2)),b=f.sqrt(f.number(3));
    const sum=f.add(a,b),expected=f.add(f.number(5),f.mul(f.number(2),f.mul(a,b)));
    expect(f.compare(f.square(sum),expected)).toBe(0);
    expect(f.compare(f.div(f.one,a),f.div(a,f.number(2)))).toBe(0);
  });
  it('imports algebraic values without copying unrelated extensions',()=>{
    const a=new AlgebraicContext(),b=new AlgebraicContext(),root=a.sqrt(a.number(2));
    a.sqrt(a.number(7));b.sqrt(b.number(3));const imported=b.import(root);
    expect(b.compare(b.square(imported),b.number(2))).toBe(0);
    expect(b.compare(b.import(a.div(a.one,root)),b.div(imported,b.number(2)))).toBe(0);
  });
});
