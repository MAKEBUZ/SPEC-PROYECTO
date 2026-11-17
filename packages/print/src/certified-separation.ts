import {algebraicSeparation} from './algebraic-separation.js';
import {AlgebraicContext,type Exact} from '../../geometry/src/algebraic.js';
import {approximateMargin} from '../../geometry/src/bounds.js';
import {rational,divide} from '../../geometry/src/numeric.js';
import type {Piece} from '../../document/src/piece.js';
import type {PrintTransform} from '../../document/src/preparation.js';
import type {DerivedLine} from '../../geometry/src/derived-path.js';
import {lineDistanceSquared,polygonContainsPoint,boxDistanceSquared,type ExactBox} from './separation.js';
import {placement} from './placement.js';
interface EnclosedLine {line:DerivedLine;error:Exact;box:ExactBox}
/** Complete-interval error bounds, never vertex sampling. A rigid transform
 * preserves the Euclidean error certificate. */
export function certifiedSeparation(a:Piece,ta:PrintTransform,b:Piece,tb:PrintTransform):'valid'|'too-close'|'overlap'{
 let tolerance=rational(1n,100n),work=0;
 const certificates=new Map<string,ReturnType<typeof algebraicSeparation>>();
 for(let pass=0;pass<24;pass++,tolerance=divide(tolerance,rational(2n))){
  const f=new AlgebraicContext();
  const approximate=(piece:Piece,t:PrintTransform):EnclosedLine[]=>{
   const result=approximateMargin({...piece,seamWidth:piece.seamWidth??0},tolerance);if(result.kind!=='certified')throw Error('SEPARATION_APPROXIMATION_UNAVAILABLE');
   const move=placement(f,t),point=(p:{x:ReturnType<typeof rational>;y:ReturnType<typeof rational>})=>move({x:f.fromRational(p.x),y:f.fromRational(p.y)});
   return result.segments.map(s=>{
    const start=point(s.start),end=point(s.end),xs=f.compare(start.x,end.x)<=0,ys=f.compare(start.y,end.y)<=0;
    return {line:{kind:'line',sourceId:s.sourceId,start,end},error:f.fromRational(s.errorUpper),box:{minX:xs?start.x:end.x,maxX:xs?end.x:start.x,minY:ys?start.y:end.y,maxY:ys?end.y:start.y}};
   });
  };
  const first=approximate(a,ta),second=approximate(b,tb);let unresolved=false;
  for(const x of first)for(const y of second){
   // Resource exhaustion is explicit and never interpreted as an invalid piece.
   if(++work>250000)throw Error('SEPARATION_RESOURCE_LIMIT');
   const error=f.add(x.error,y.error),upper=f.add(f.number(2),error),lower=f.sub(f.number(2),error);
   if(f.compare(boxDistanceSquared(f,x.box,y.box),f.square(upper))>=0)continue;
   const distance=lineDistanceSquared(f,x.line,y.line);
   if(f.sign(lower)>0&&f.compare(distance,f.square(lower))<0)return 'too-close';
   if(f.compare(distance,f.square(upper))<0){
    const key=JSON.stringify([x.line.sourceId,y.line.sourceId]);
    let exact=certificates.get(key);
    if(!exact){exact=algebraicSeparation(a,ta,b,tb,[x.line.sourceId,y.line.sourceId]);certificates.set(key,exact);}
    if(exact==='too-close')return 'too-close';
    // Local supports need not share a global separating line. In addition to
    // >=2 on the actual source paths, require disjoint approximation tubes so
    // the containment test below remains invariant under their deformation.
    if(exact!=='valid'||f.compare(distance,f.square(error))<=0)unresolved=true;
   }
  }
  if(!unresolved){
   // The two certified tubes cannot meet; containment is invariant during
   // the bounded deformation to the topology-preserving polylines.
   if(polygonContainsPoint(f,first[0]!.line.start,second.map(s=>s.line))||polygonContainsPoint(f,second[0]!.line.start,first.map(s=>s.line)))return 'overlap';
   return 'valid';
  }
 }
 throw Error('SEPARATION_REQUIRES_EXACT_FALLBACK');
}

