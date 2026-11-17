import {it,expect} from 'vitest';
import {readFile} from 'node:fs/promises';
import {AlgebraicContext} from '../../packages/geometry/src/algebraic.js';
import {certifyOffsetSelfCrossing} from '../../packages/geometry/src/offset-intersections.js';
import {rational as q} from '../../packages/geometry/src/numeric.js';
import {evaluate,isolateRoots,rationals as Q,polynomialMultiply,refineRoot,RootField} from '../../packages/geometry/src/polynomials.js';

it('certifies a real crossing but never infers invalidity from samples or discarded parameters',async()=>{
 const shape=JSON.parse(await readFile('tests/support/concave-rounded.json','utf8')),s=shape.segments[4],p=(i:number)=>({x:shape.points[i][0],y:shape.points[i][1]});
 const curve={controls:[p(s.start),s.handleStart,s.handleEnd,p(s.end)],width:10,winding:1 as const};
 expect(certifyOffsetSelfCrossing(curve)).toBe(true);
 expect(certifyOffsetSelfCrossing(curve,q(3n,10n),q(6n,10n))).toBe(false);
 expect(certifyOffsetSelfCrossing({...curve,width:1})).toBe(false);
 expect(certifyOffsetSelfCrossing({...curve,width:0})).toBe(false);
 expect(certifyOffsetSelfCrossing({...curve,winding:-1})).toBe(false);
});
it('keeps independent algebraic root branches and imports their certified values exactly',()=>{
 const f=new AlgebraicContext(),s=f.sqrt(f.number(2));f.sqrt(f.number(3));f.sqrt(f.number(5));
 const p=[f.sub(f.zero,s),f.zero,f.zero,f.one],branches=f.rootBranches(p,q(0n),q(2n));
 expect(branches).toHaveLength(1);const b=branches[0]!,polynomial=p.map(b.import);
 expect(b.field.sign(evaluate(polynomial,b.root,b.field))).toBe(0);
 const root=f.import(b.root);expect(f.sign(f.sub(f.mul(f.square(root),root),s))).toBe(0);
 const inverse=f.div(f.one,root);expect(f.compare(f.mul(root,inverse),f.one)).toBe(0);
});
it('uses exact root certificates for close simple roots and retains repeated-root fallback',()=>{
 const p=polynomialMultiply([q(-1n,3n),q(1n)],[q(-2n,3n),q(1n)],Q),roots=isolateRoots(p,q(0n),q(1n),Q);
 expect(roots).toHaveLength(2);for(const root of roots){for(let i=0;i<20;i++)refineRoot(root,Q);const field=new RootField(Q,root);expect(field.sign(evaluate(p.map(c=>field.fromRational(c)),field.generator,field))).toBe(0);}
 const repeated=isolateRoots(polynomialMultiply(p,p,Q),q(0n),q(1n),Q);expect(repeated.map(r=>r.multiplicity)).toEqual([2,2]);
});
