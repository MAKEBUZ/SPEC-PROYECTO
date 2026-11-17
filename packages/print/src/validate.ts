import {validateDocument} from '../../document/src/schema.js';
import {productionMetadataIssues,type Piece} from '../../document/src/piece.js';
import type {Preparation,PrintTransform} from '../../document/src/preparation.js';
import {inspectContour} from '../../geometry/src/intersections.js';
import {segmentControls} from '../../geometry/src/contour-validation.js';
import {derivative,evaluate} from '../../geometry/src/polynomials.js';

import {contourDimensions,marginDimensions,dimensionsOfPoints,evaluateMargin} from '../../geometry/src/bounds.js';
import {AlgebraicContext,type Exact} from '../../geometry/src/algebraic.js';
import type {DerivedLine,DerivedPrimitive} from '../../geometry/src/derived-path.js';
import {pathSeparation} from './path-separation.js';
import {boxSeparated,type ExactBox} from './separation.js';
import {printLayout} from './layout.js';
import {offsetCriticalParameters,evaluateDerivedOffset} from '../../geometry/src/offset-intersections.js';
import {placement} from './placement.js';
import {certifiedSeparation} from './certified-separation.js';
import {shapeKey} from './shape-key.js';

export interface ProductionIssue {code:string;pieceId?:string;otherPieceId?:string;detail?:string}
export interface ProductionValidation {status:'valid'|'invalid'|'technical-error';issues:ProductionIssue[];layout?:ReturnType<typeof printLayout>}
export interface Placed {margin:ReturnType<typeof evaluateMargin>;pieceId:string;bounds:ExactBox;lines?:DerivedLine[];path?:DerivedPrimitive[]}
function translateGeometry(f:AlgebraicContext,source:Placed,original:Piece,piece:Piece,t:PrintTransform):Placed{
 const ids=new Map([...original.contour.points.map((p,i)=>[p.id,piece.contour.points[i]!.id] as const),...original.contour.segments.map((s,i)=>[s.id,piece.contour.segments[i]!.id] as const)]);
 const x=f.number(t.x),y=f.number(t.y),move=(p:{x:Exact;y:Exact})=>({x:f.add(p.x,x),y:f.add(p.y,y)});
 const line=(p:DerivedLine):DerivedLine=>({...p,sourceId:ids.get(p.sourceId)??p.sourceId,start:move(p.start),end:move(p.end)});
 return {margin:source.margin,pieceId:piece.id,bounds:{minX:f.add(source.bounds.minX,x),maxX:f.add(source.bounds.maxX,x),minY:f.add(source.bounds.minY,y),maxY:f.add(source.bounds.maxY,y)},
  ...source.lines?{lines:source.lines.map(line)}:{},...source.path?{path:source.path.map(p=>p.kind==='arc'?{...p,sourceId:ids.get(p.sourceId)??p.sourceId,start:move(p.start),end:move(p.end),center:move(p.center)}:line(p))}:{}};
}
function stationary(f:AlgebraicContext,coefficients:Exact[]){
 const p=derivative(coefficients,f);while(p.length&&f.sign(p.at(-1)!)===0)p.pop();
 if(p.length<2)return [];if(p.length===2)return [f.div(f.sub(f.zero,p[0]!),p[1]!)];
 const [c,b,a]=p as [Exact,Exact,Exact],discriminant=f.sub(f.square(b),f.mul(f.number(4),f.mul(a,c)));if(f.sign(discriminant)<0)return [];
 const root=f.sqrt(discriminant),den=f.mul(f.number(2),a);return [f.div(f.sub(root,b),den),f.div(f.sub(f.sub(f.zero,root),b),den)];
}
export function productionGeometry(f:AlgebraicContext,p:Piece,t:PrintTransform,issues:ProductionIssue[]):Placed|undefined{
 const defects=inspectContour(p.contour).defects;if(defects.length){issues.push(...defects.map(detail=>({code:'CONTOUR_INVALID',pieceId:p.id,detail})));return;}
 const base=contourDimensions(p.contour);if(base.exceeded.length){issues.push(...base.exceeded.map(detail=>({code:'PIECE_SIZE_EXCEEDED',pieceId:p.id,detail})));return;}
 const evaluatedMargin=evaluateMargin(p),margin=evaluatedMargin.validation;if(margin.kind==='invalid-base'||margin.kind==='invalid-margin'){issues.push(...margin.defects.map(detail=>({code:'MARGIN_INVALID',pieceId:p.id,detail})));return;}
 const move=placement(f,t);
 let lines:DerivedLine[]|undefined;
 if(margin.kind==='validated'){
  if(margin.path.every(e=>e.kind!=='offset')){
   const path:DerivedPrimitive[]=margin.path.map(e=>e.kind==='arc'?{...e,start:move(e.start),end:move(e.end),center:move(e.center),radius:f.import(e.radius)}:{kind:'line',sourceId:e.sourceId,start:move(e.start),end:move(e.end)});
   return {margin:evaluatedMargin,pieceId:p.id,path,bounds:marginDimensions(f,path).bounds};
  }
 }else if(p.contour.segments.every(e=>e.kind==='line')){
  const points=new Map(p.contour.points.map(v=>[v.id,{x:f.number(v.x),y:f.number(v.y)}]));lines=p.contour.segments.map(e=>({kind:'line',sourceId:e.id,start:move(points.get(e.startId)!),end:move(points.get(e.endId)!)}));
 }
 if(lines)return {margin:evaluatedMargin,pieceId:p.id,lines,path:lines,bounds:dimensionsOfPoints(f,lines.flatMap(e=>[e.start,e.end])).bounds};
 if(margin.kind!=='validated'){
  const extrema=p.contour.segments.flatMap(segment=>{
   const controls=segmentControls(p.contour,segment.id).map(v=>move({x:f.number(v.x),y:f.number(v.y)}));
   const polynomial=(axis:'x'|'y')=>{const a=controls[0]![axis],b=controls[1]![axis];if(controls.length===2)return [a,f.sub(b,a)];const c=controls[2]![axis],d=controls[3]![axis],three=f.number(3);
    return [a,f.mul(three,f.sub(b,a)),f.mul(three,f.add(f.sub(a,f.mul(f.number(2),b)),c)),f.add(f.sub(d,a),f.mul(three,f.sub(b,c)))];};
   const x=polynomial('x'),y=polynomial('y'),parameters=[f.zero,f.one,...stationary(f,x),...stationary(f,y)];
   return parameters.filter(t=>f.sign(t)>=0&&f.compare(t,f.one)<=0).map(t=>({x:evaluate(x,t,f),y:evaluate(y,t,f)}));
  });return {margin:evaluatedMargin,pieceId:p.id,bounds:dimensionsOfPoints(f,extrema).bounds};
 }
 const degrees=((t.rotation%360)+360)%360,r=degrees*Math.PI/180,c=degrees===0?1:degrees===180?-1:degrees===90||degrees===270?0:Math.cos(r),s=degrees===90?1:degrees===270?-1:degrees===0||degrees===180?0:Math.sin(r);
 const extrema=margin.path.flatMap(e=>{
  if(e.kind==='offset'){
   const from=f.import(e.from),to=f.import(e.to),parameters=offsetCriticalParameters(f,e.curve,[{x:c,y:-s},{x:s,y:c}]);
   return [move(e.start),move(e.end),...parameters.filter(v=>f.compare(v,from)>0&&f.compare(v,to)<0).map(v=>move(evaluateDerivedOffset(f,e.curve,v)))];
  }
  const transformed=e.kind==='arc'?{...e,start:move(e.start),end:move(e.end),center:move(e.center),radius:f.import(e.radius)}:{...e,start:move(e.start),end:move(e.end)};
  const b=marginDimensions(f,[transformed]).bounds;return [{x:b.minX,y:b.minY},{x:b.maxX,y:b.maxY}];
 });return {margin:evaluatedMargin,pieceId:p.id,bounds:dimensionsOfPoints(f,extrema).bounds};
}
function finiteUpper(f:AlgebraicContext,value:Exact){
 // A conservative outward value is only used for layout; geometric limits
 // are decided exactly before this conversion.
 let lo=0,hi=10000;while(hi/2>0&&f.compare(value,f.number(hi/2))<0)hi/=2;
 for(let i=0;i<80;i++){const mid=(lo+hi)/2;if(mid===lo||mid===hi)break;const sign=f.compare(value,f.number(mid));if(sign===0)return mid;if(sign>0)lo=mid;else hi=mid;}return hi;
}
/** Never mutates or repairs drafts. A technical failure is not geometric
 * invalidity and is never permission to export. */
export function validateProduction(input:unknown,preparationId:string,capture?:(field:AlgebraicContext,placed:readonly Placed[])=>void):ProductionValidation{
 const issues:ProductionIssue[]=[];let document;try{document=validateDocument(input);}catch{return {status:'invalid',issues:[{code:'DOCUMENT_INVALID'}]};}
 const p=document.preparations.find(v=>v.id===preparationId) as Preparation|undefined;
 if(!p)return {status:'invalid',issues:[{code:'PREPARATION_NOT_FOUND'}]};
 if(p.selection.length<1||p.selection.length>100)return {status:'invalid',issues:[{code:'SELECTION_LIMIT_EXCEEDED'}]};
 const f=new AlgebraicContext(),placed:Placed[]=[],shapes=new Map<string,{piece:Piece;geometry:Placed}>();let technical=false;
 for(const id of p.selection){const piece=document.pieces.find(v=>v.id===id);if(!piece){issues.push({code:'PIECE_MISSING',pieceId:id});continue;}
  issues.push(...productionMetadataIssues(piece).map(detail=>({code:'METADATA_REQUIRED',pieceId:id,detail})));
  try{
   const t=p.transforms[id]!,key=shapeKey(piece)+'/'+String(t.rotation);let cached=shapes.get(key);
   if(!cached){const geometry=productionGeometry(f,piece,{...t,x:0,y:0},issues);if(geometry){cached={piece,geometry};shapes.set(key,cached);}}
   if(cached)placed.push(translateGeometry(f,cached.geometry,cached.piece,piece,t));
  }catch(e){technical=true;issues.push({code:'GEOMETRY_CALCULATION_FAILED',pieceId:id,detail:e instanceof Error?e.message:'UNKNOWN'});}
 }
 try{
  for(let i=0;i<placed.length;i++)for(let j=i+1;j<placed.length;j++){const a=placed[i]!,b=placed[j]!;if(boxSeparated(f,a.bounds,b.bounds))continue;
   let result:'valid'|'too-close'|'overlap';try{
    result=a.path&&b.path?pathSeparation(f,a.path,b.path):certifiedSeparation(document.pieces.find(v=>v.id===a.pieceId)!,p.transforms[a.pieceId]!,document.pieces.find(v=>v.id===b.pieceId)!,p.transforms[b.pieceId]!);
   }catch(e){technical=true;issues.push({code:'CURVED_SEPARATION_UNRESOLVED',pieceId:a.pieceId,otherPieceId:b.pieceId,detail:e instanceof Error?e.message:'UNKNOWN'});continue;}
   if(result!=='valid')issues.push({code:result==='overlap'?'PIECES_OVERLAP':'SEPARATION_BELOW_2MM',pieceId:a.pieceId,otherPieceId:b.pieceId});
  }
  if(placed.length){const bounds=dimensionsOfPoints(f,placed.flatMap(v=>[{x:v.bounds.minX,y:v.bounds.minY},{x:v.bounds.maxX,y:v.bounds.maxY}]));
   for(const [detail,value] of [['width',bounds.width],['height',bounds.height]] as const)if(f.compare(value,f.number(10000))>0)issues.push({code:'COMPOSITION_LIMIT_EXCEEDED',detail});
   if(!issues.length){try{const layout=printLayout({...p,width:finiteUpper(f,bounds.width),height:finiteUpper(f,bounds.height)},{field:f,width:bounds.width,height:bounds.height});capture?.(f,placed);return {status:'valid',issues:[],layout};}catch(e){issues.push({code:'LAYOUT_INVALID',detail:e instanceof Error?e.message:'UNKNOWN'});}}
  }
 }catch(e){technical=true;issues.push({code:'GEOMETRY_CALCULATION_FAILED',detail:e instanceof Error?e.message:'UNKNOWN'});}
 return {status:technical?'technical-error':'invalid',issues};
}

