import {it,expect} from 'vitest';
import {AlgebraicContext} from '../../packages/geometry/src/algebraic.js';
import {evaluateDerivedOffset,intersectOffsetLine,offsetCriticalParameters,type OffsetCurve} from '../../packages/geometry/src/offset-intersections.js';
import {rational} from '../../packages/geometry/src/numeric.js';
it.each([1,-1] as const)('certifies a supporting tangent and finite endpoint contact for winding %s',winding=>{
 const f=new AlgebraicContext(),curve:OffsetCurve={controls:[{x:0,y:0},{x:2,y:-winding},{x:4,y:-winding},{x:6,y:0}],width:1,winding};
 const p=evaluateDerivedOffset(f,curve,f.zero),v={x:f.number(2),y:f.number(-winding)};
 const point=(t:number)=>({x:f.add(p.x,f.mul(f.number(t),v.x)),y:f.add(p.y,f.mul(f.number(t),v.y))});
 const line={kind:'line' as const,sourceId:'support',start:point(-2),end:point(2)};
 const hits=intersectOffsetLine(f,curve,line);expect(hits).toHaveLength(1);expect(f.sign(hits[0]!.curveParameter)).toBe(0);expect(f.compare(hits[0]!.otherParameter!,f.fromRational(rational(1n,2n)))).toBe(0);
 expect(intersectOffsetLine(f,curve,{...line,start:point(1),end:point(2)})).toEqual([]);
 const critical=offsetCriticalParameters(f,curve);expect(critical.some(t=>f.compare(t,f.fromRational(rational(1n,2n)))===0)).toBe(true);
});
it('keeps actual interior intersections when the line is not a supporting tangent',()=>{
 const f=new AlgebraicContext(),curve:OffsetCurve={controls:[{x:0,y:0},{x:2,y:-1},{x:4,y:-1},{x:6,y:0}],width:1,winding:1};
 const hits=intersectOffsetLine(f,curve,{kind:'line',sourceId:'cut',start:{x:f.number(3),y:f.number(-10)},end:{x:f.number(3),y:f.number(10)}});
 expect(hits).toHaveLength(1);expect(f.compare(hits[0]!.curveParameter,f.fromRational(rational(1n,2n)))).toBe(0);
});
it('does not lose quadratic endpoint roots or introduce out-of-range roots into a tower',()=>{
 const f=new AlgebraicContext();f.sqrt(f.number(2));
 expect(f.roots([f.one,f.zero,f.fromRational(rational(1n,1n<<100n))])).toEqual([]);
 const endpoints=f.roots([f.zero,f.number(-1),f.one]);expect(endpoints.map(x=>f.sign(x))).toEqual([0,1]);expect(f.compare(endpoints[1]!,f.one)).toBe(0);
 const root=f.roots([f.number(-2),f.zero,f.zero,f.one],rational(1n),rational(2n))[0]!;
 expect(f.sign(f.sub(root,f.fromRational(rational(1259921049894873n,1000000000000000n))))).toBe(1);
 expect(f.sign(f.sub(f.mul(f.square(root),root),f.number(2)))).toBe(0);
});
it('retains an inward-offset cusp while certifying the outward curvature branch',()=>{
 const f=new AlgebraicContext(),curve:OffsetCurve={controls:[{x:0,y:0},{x:1,y:0},{x:2,y:1},{x:3,y:3}],width:3,winding:-1};
 const roots=offsetCriticalParameters(f,curve).filter(t=>f.sign(t)>0&&f.compare(t,f.one)<0);expect(roots).toHaveLength(1);
 const speed2=f.add(f.number(9),f.mul(f.number(36),f.square(roots[0]!)));
 expect(f.sign(f.sub(f.mul(f.square(speed2),speed2),f.number(2916)))).toBe(0);
 expect(offsetCriticalParameters(f,{...curve,winding:1}).filter(t=>f.sign(t)>0&&f.compare(t,f.one)<0)).toEqual([]);
});
it('orders rational values exactly without accepting values from another context',()=>{
 const f=new AlgebraicContext(),g=new AlgebraicContext(),a=f.fromRational(rational(1n,1n<<1000n)),b=f.fromRational(rational(1n,(1n<<1000n)+1n));
 expect(f.compare(a,b)).toBe(1);expect(f.compare(b,a)).toBe(-1);expect(f.compare(a,a)).toBe(0);
 expect(()=>f.compare(a,g.zero)).toThrow('ALGEBRAIC_CONTEXT_MISMATCH');
});
