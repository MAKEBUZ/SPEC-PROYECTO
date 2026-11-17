import { rational as q, add, subtract, multiply, compare, fromNumber } from './numeric.js';
import type { Rational } from './numeric.js';
import type { Coordinate, CornerJoin } from './model.js';
import { RootField, isolateRoots, rationals as Q } from './polynomials.js';

export interface ExactVector { x:Rational; y:Rational }
export type Winding=1|-1;
export interface JoinInput {
  vertexId:string;
  vertex:Coordinate;
  incoming:ExactVector;
  outgoing:ExactVector;
  width:number;
  winding:Winding;
  style:CornerJoin;
}
export type Join = JoinInput & {kind:'smooth'|'miter'|'round'|'concave'|'reversal'};
export class OffsetCalculationError extends Error {
  constructor(readonly code:string){super(`No se pudo calcular el margen: ${code}`);this.name='OffsetCalculationError';}
}
export function normSquared(v:ExactVector):Rational {return add(multiply(v.x,v.x),multiply(v.y,v.y));}
export function cross(a:ExactVector,b:ExactVector):Rational {return subtract(multiply(a.x,b.y),multiply(a.y,b.x));}
/** Positive algebraic square root; no normalization through binary64 sqrt. */
export function squareRootField(radicand:Rational):RootField<Rational> {
  if(compare(radicand,q(0n))<=0)throw new OffsetCalculationError('NON_POSITIVE_SPEED');
  const exponent=Math.max(0,Math.ceil((radicand.n.toString(2).length-radicand.d.toString(2).length+1)/2));
  const upper=q(1n<<BigInt(exponent));
  const root=isolateRoots([Q.sub(Q.zero,radicand),Q.zero,Q.one],Q.zero,upper,Q)[0];
  if(!root)throw new OffsetCalculationError('SQUARE_ROOT_NOT_ISOLATED');
  return new RootField(Q,root);
}
function check(input:JoinInput):void {
  if(!Number.isFinite(input.width)||input.width<0)throw new OffsetCalculationError('INVALID_WIDTH');
  if(input.winding!==1&&input.winding!==-1)throw new OffsetCalculationError('INVALID_WINDING');
  if(input.style!=='round'&&input.style!=='miter')throw new OffsetCalculationError('INVALID_JOIN_STYLE');
  fromNumber(input.vertex.x);fromNumber(input.vertex.y);
  if(compare(normSquared(input.incoming),q(0n))===0||compare(normSquared(input.outgoing),q(0n))===0)throw new OffsetCalculationError('ZERO_TANGENT');
}
export function constructJoin(input:JoinInput):Join {
  check(input);
  const turn=compare(cross(input.incoming,input.outgoing),q(0n))*input.winding;
  const dot=add(multiply(input.incoming.x,input.outgoing.x),multiply(input.incoming.y,input.outgoing.y));
  const kind=turn<0?'concave':turn>0?input.style:compare(dot,q(0n))>0?'smooth':'reversal';
  return {...structuredClone(input),kind};
}
/** Exact endpoints and tangent-support intersection. For a curved concavity,
 * the support intersection is NOT the local intersection of the offsets. */
export function joinGeometry(join:Join) {
  check(join);
  const K=squareRootField(normSquared(join.incoming)),other=squareRootField(normSquared(join.outgoing));
  const L=new RootField(K,{...other.root,polynomial:other.root.polynomial.map(c=>K.fromRational(c))});
  const aNorm=L.constant(K.generator),bNorm=L.generator;
  const a={x:L.fromRational(join.incoming.x),y:L.fromRational(join.incoming.y)};
  const b={x:L.fromRational(join.outgoing.x),y:L.fromRational(join.outgoing.y)};
  const center={x:L.fromRational(fromNumber(join.vertex.x)),y:L.fromRational(fromNumber(join.vertex.y))};
  const width=L.fromRational(multiply(fromNumber(join.width),q(BigInt(join.winding))));
  const shift=(v:typeof a,n:typeof aNorm)=>({x:L.add(center.x,L.div(L.mul(width,v.y),n)),y:L.sub(center.y,L.div(L.mul(width,v.x),n))});
  const start=shift(a,aNorm),end=shift(b,bNorm);
  const det=L.sub(L.mul(a.x,b.y),L.mul(a.y,b.x));
  let supportIntersection:typeof start|null=null;
  if(L.sign(det)!==0){
    const dx=L.sub(end.x,start.x),dy=L.sub(end.y,start.y);
    const parameter=L.div(L.sub(L.mul(dx,b.y),L.mul(dy,b.x)),det);
    supportIntersection={x:L.add(start.x,L.mul(parameter,a.x)),y:L.add(start.y,L.mul(parameter,a.y))};
  }
  return {field:L,start,end,center,supportIntersection,radius:fromNumber(join.width)};
}
