import {it,expect} from 'vitest';
import {AlgebraicContext} from '../../packages/geometry/src/algebraic.js';
import {nonnegativeOnUnitSquare} from '../../packages/geometry/src/bivariate-sign.js';
it.each([
 {name:'repeated diagonal',p:[[0,0,1],[0,-2],[1]],valid:true},
 {name:'negative stripe narrower than a floating tolerance',p:[[-(2**-80),0,1],[0,-2],[1]],valid:false},
 {name:'zero polynomial',p:[],valid:true},
 {name:'vanishing fibre with a sign change',p:[[0,0,-.5,1],[0,1,-2],[-.5,1]],valid:false},
 {name:'isolated equality',p:[[.5,-1,1],[-1],[1]],valid:true},
 {name:'boundary crossing',p:[[0,-1],[1]],valid:false},
 {name:'positive constant',p:[[4]],valid:true},
])('classifies $name',({p,valid})=>{
 const f=new AlgebraicContext();expect(nonnegativeOnUnitSquare(f,p.map(row=>row.map(n=>f.number(n))))).toBe(valid);
});
it('detects a negative interior disk smaller than binary64 rounding at its centre',()=>{
 const f=new AlgebraicContext(),epsilon=f.number(2**-60),p=[[f.sub(f.number(.5),epsilon),f.number(-1),f.one],[f.number(-1)],[f.one]];
 expect(nonnegativeOnUnitSquare(f,p)).toBe(false);
});
