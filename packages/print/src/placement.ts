import type {AlgebraicContext} from '../../geometry/src/algebraic.js';
import type {ExactPoint} from '../../geometry/src/derived-path.js';
import type {PrintTransform} from '../../document/src/preparation.js';
export function placement(f:AlgebraicContext,t:PrintTransform){
 const degrees=((t.rotation%360)+360)%360,r=degrees*Math.PI/180;
 let c=f.number(degrees===0?1:degrees===180?-1:degrees===90||degrees===270?0:Math.cos(r));
 let s=f.number(degrees===90?1:degrees===270?-1:degrees===0||degrees===180?0:Math.sin(r));
 const norm=f.sqrt(f.add(f.square(c),f.square(s)));c=f.div(c,norm);s=f.div(s,norm);
 return (p:ExactPoint)=>{const x=f.import(p.x),y=f.import(p.y);return {x:f.add(f.sub(f.mul(c,x),f.mul(s,y)),f.number(t.x)),y:f.add(f.add(f.mul(s,x),f.mul(c,y)),f.number(t.y))};};
}
