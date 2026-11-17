import {productionMessage} from './issue-message.js';
import {AlgebraicContext,type Exact} from '../../geometry/src/algebraic.js';
import {approximateMargin,dimensionsOfPoints} from '../../geometry/src/bounds.js';
import {rational,add,subtract,divide,fromNumber,compare} from '../../geometry/src/numeric.js';
import {segmentControls} from '../../geometry/src/contour-validation.js';
import {validateDocument} from '../../document/src/schema.js';
import {savedPdfOrigin} from '../../document/src/pdf-artifact.js';
import type {Preparation} from '../../document/src/preparation.js';
import {placement} from './placement.js';
import {validateProduction,type Placed} from './validate.js';
import {shapeKey} from './shape-key.js';
export interface PrintPoint {x:number;y:number}
export interface PrintCurve {kind:'line'|'cubic';points:PrintPoint[]}
/** Conversion happens after subtracting the exact origin, so large local
 * translations do not erase small pattern coordinates. */
function number(f:AlgebraicContext,v:Exact):number{
 const bounds=f.enclosingInterval(v),middle=divide(add(bounds.lo,bounds.hi),rational(2n)),estimate=Number(middle.n)/Number(middle.d),limit=rational(1n,200000000n);
 if(Number.isFinite(estimate)){
  const candidate=fromNumber(estimate);
  if(compare(subtract(bounds.hi,candidate),limit)<=0&&compare(subtract(candidate,bounds.lo),limit)<=0)return estimate;
 }
 // A floating estimate is accepted only after checking its exact rational
 // error. Overflow/underflow or uncertainty falls back to interval bisection.
 if(v.level===0&&!Array.isArray(v.raw)){
  const estimate=Number(v.raw.n)/Number(v.raw.d);
  if(Number.isFinite(estimate)){
   const error=f.sub(v,f.number(estimate)),limit=f.fromRational(rational(1n,200000000n));
   if(f.compare(error,limit)<=0&&f.compare(error,f.sub(f.zero,limit))>=0)return estimate;
  }
 }
 let lo=-1,hi=1;while(f.compare(v,f.number(lo))<0){lo*=2;if(!Number.isFinite(lo))throw Error('PRINT_COORDINATE_UNREPRESENTABLE');}
 while(f.compare(v,f.number(hi))>0){hi*=2;if(!Number.isFinite(hi))throw Error('PRINT_COORDINATE_UNREPRESENTABLE');}
 for(let i=0;i<1100;i++){const mid=lo/2+hi/2;if(hi-lo<=1e-8)return mid;if(mid===lo||mid===hi)throw Error('PRINT_COORDINATE_PRECISION');const sign=f.compare(v,f.number(mid));if(!sign)return mid;if(sign<0)hi=mid;else lo=mid;}
 throw Error('PRINT_COORDINATE_PRECISION');
}
export function printScene(input:unknown,preparationId:string){
 let geometry:{field:AlgebraicContext;placed:readonly Placed[]}|undefined;
 const document=validateDocument(input),origin=savedPdfOrigin(document,preparationId),validation=validateProduction(document,preparationId,(field,placed)=>{geometry={field,placed};});
 if(validation.status!=='valid'||!validation.layout)throw Error('PRODUCTION_INVALID: '+productionMessage(validation.issues));
 // Reuse only within this evaluation. The independent PDF verifier invokes a
 // fresh scene/validation and never trusts the generator's captured objects.
 if(!geometry)throw Error('PRODUCTION_GEOMETRY_MISSING');
 const preparation=document.preparations.find(p=>p.id===preparationId) as unknown as Preparation,f=geometry.field,placed=geometry.placed;
 const selected=preparation.selection.map(id=>document.pieces.find(p=>p.id===id)!);
 const bounds=dimensionsOfPoints(f,placed.flatMap(p=>[{x:p.bounds.minX,y:p.bounds.minY},{x:p.bounds.maxX,y:p.bounds.maxY}])).bounds;
 const approximations=new Map<string,ReturnType<typeof approximateMargin>>();
 const templates=new Map<string,{base:PrintCurve[];exterior:PrintCurve[]}|null>();
 const pieces=selected.map((piece,i)=>{
  const move=placement(f,preparation.transforms[piece.id]!),normalize=(p:{x:Exact;y:Exact}):PrintPoint=>{const v=move(p);return {x:number(f,f.sub(v.x,bounds.minX)),y:number(f,f.sub(v.y,bounds.minY))};};
  const point=(p:PrintPoint)=>normalize({x:f.number(p.x),y:f.number(p.y)});
  const key=shapeKey(piece);let margin=approximations.get(key);
  // Certified 0.01 mm margin approximation plus the verifier's 0.02 mm path
  // bound remains below the approved 0.1 mm CAD–PDF deviation.
  if(!margin){margin=piece.seamWidth===null?approximateMargin({...piece,seamWidth:0},rational(1n,100n)):placed[i]!.margin.approximate(rational(1n,100n));approximations.set(key,margin);}
  if(margin.kind!=='certified')throw Error('PRINT_MARGIN_UNAVAILABLE');
  const templateKey=key+'/'+preparation.transforms[piece.id]!.rotation;
  let template=templates.get(templateKey);
  const origin=piece.contour.points[0]!;
  const paths=(convert:(p:{x:Exact;y:Exact})=>PrintPoint,field=f)=>({
   base:piece.contour.segments.map(s=>({kind:s.kind,points:segmentControls(piece.contour,s.id).map(p=>convert({x:field.number(p.x),y:field.number(p.y)}))})),
   exterior:margin.segments.map(s=>({kind:'line' as const,points:[s.start,s.end].map(p=>convert({x:field.fromRational(p.x),y:field.fromRational(p.y)}))}))
  });
  if(template===undefined){
   // Subtract a stored rational anchor BEFORE conversion/rotation. Hundreds
   // of vertices then need only the rotation's field, not the margin's full
   // algebraic tower. The independently certified anchor offset is added once
   // per point; conversion + placement error remains below 3e-8 mm.
   // Unbounded control handles retain the original exact normalization path.
   const local=new AlgebraicContext(),rotate=placement(local,{x:0,y:0,rotation:preparation.transforms[piece.id]!.rotation});
   const anchor={x:local.number(origin.x),y:local.number(origin.y)};
   try{template=paths(p=>{const v=rotate({x:local.sub(p.x,anchor.x),y:local.sub(p.y,anchor.y)}),x=number(local,v.x),y=number(local,v.y);if(Math.abs(x)>1e6||Math.abs(y)>1e6)throw Error('TEMPLATE_RANGE');return{x,y};},local);}
   catch{template=null;}
   templates.set(templateKey,template);
  }
  const anchor=move({x:f.number(origin.x),y:f.number(origin.y)});
  const offset=template?{x:number(f,f.sub(anchor.x,bounds.minX)),y:number(f,f.sub(anchor.y,bounds.minY))}:{x:0,y:0};
  const translate=(curves:PrintCurve[])=>curves.map(c=>({...c,points:c.points.map(p=>({x:p.x+offset.x,y:p.y+offset.y}))}));
  const {base,exterior}=template?{base:translate(template.base),exterior:translate(template.exterior)}:paths(normalize);
  return {id:piece.id,name:piece.name,sizeLabel:piece.sizeLabel,cutQuantity:piece.cutQuantity!,fold:piece.fold,base,exterior,grainline:[point(piece.grainline!.start),point(piece.grainline!.end)],label:{x:number(f,f.sub(placed[i]!.bounds.minX,bounds.minX))+3,y:number(f,f.sub(placed[i]!.bounds.minY,bounds.minY))+3}};
 });
 return {origin,layout:validation.layout,pieces};
}
export type PrintScene=ReturnType<typeof printScene>;


