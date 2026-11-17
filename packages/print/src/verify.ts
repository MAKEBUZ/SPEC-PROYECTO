import {getDocument,OPS} from 'pdfjs-dist/legacy/build/pdf.mjs';
import {printScene,type PrintCurve,type PrintPoint} from './scene.js';
import {PDF_PROFILE} from './pdf.js';
import type {PdfMeasurement} from '../../document/src/pdf-artifact.js';
type Matrix=[number,number,number,number,number,number];
interface Box {x:number;y:number;width:number;height:number}
interface State {matrix:Matrix;color:string;dash:number[];clip:Box|null;width:number}
interface Stroke {curves:PrintCurve[];color:string;dash:number[];clip:Box|null;width:number}
const MM=72/25.4,TOL=.02;
const near=(a:number,b:number,tolerance=TOL)=>Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<=tolerance;
const multiply=(a:Matrix,b:Matrix):Matrix=>[a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];
function curvesMatch(actual:PrintCurve[],expected:PrintCurve[],offset:PrintPoint){
 if(actual.length!==expected.length)return false;
 // For matching Bézier control points, the convex-hull property bounds the
 // entire parametric difference in both directions, not merely its vertices.
 return actual.every((curve,i)=>curve.kind===expected[i]!.kind&&curve.points.length===expected[i]!.points.length&&curve.points.every((p,j)=>Math.hypot(p.x-expected[i]!.points[j]!.x-offset.x,p.y-expected[i]!.points[j]!.y-offset.y)<=TOL));
}
function boxMatch(a:Box|null,b:Box){return a!==null&&(['x','y','width','height'] as const).every(k=>near(a[k],b[k],.005));}
const line=(x:number,y:number,u:number,v:number):PrintCurve=>({kind:'line',points:[{x,y},{x:u,y:v}]});
const rectangle=(x:number,y:number,w:number,h:number):PrintCurve[]=>[line(x,y,x+w,y),line(x+w,y,x+w,y+h),line(x+w,y+h,x,y+h),line(x,y+h,x,y)];
function sameStroke(actual:Stroke,expected:Stroke){return actual.color===expected.color&&near(actual.width,expected.width,.001)&&actual.dash.length===expected.dash.length&&actual.dash.every((d,i)=>near(d,expected.dash[i]!,.001))&&curvesMatch(actual.curves,expected.curves,{x:0,y:0});}
function decode(fn:number[],args:unknown[][],height:number,unit:number):Stroke[]{
 let state:State={matrix:[1,0,0,1,0,0],color:'#000000',dash:[],clip:null,width:1},pendingClip=false;
 const stack:State[]=[],strokes:Stroke[]=[];
 const point=(x:number,y:number):PrintPoint=>({x:(state.matrix[0]*x+state.matrix[2]*y+state.matrix[4])*unit/MM,y:height-(state.matrix[1]*x+state.matrix[3]*y+state.matrix[5])*unit/MM});
 const ignored=new Set<number>([OPS.dependency,OPS.beginText,OPS.endText,OPS.setTextMatrix,OPS.setFont,OPS.showText,OPS.setCharSpacing,OPS.setWordSpacing,OPS.setHScale,OPS.setLeading,OPS.setTextRise,OPS.moveText,OPS.setLeadingMoveText,OPS.nextLine]);
 for(let i=0;i<fn.length;i++){
  const op=fn[i]!,a=args[i]??[];
  if(op===OPS.save){stack.push(structuredClone(state));continue;}
  if(op===OPS.restore){const next=stack.pop();if(!next)throw Error('PDF_GRAPHICS_STATE_INVALID');state=next;continue;}
  if(op===OPS.transform){if(a.length!==6||!a.every(n=>typeof n==='number'&&Number.isFinite(n)))throw Error('PDF_MATRIX_INVALID');state.matrix=multiply(state.matrix,a as Matrix);continue;}
  if(op===OPS.setStrokeRGBColor){state.color=String(a[0]);continue;}
  if(op===OPS.setStrokeGray){state.color=Number(a[0])===0?'#000000':'unsupported';continue;}
  if(op===OPS.setFillRGBColor){if(a[0]!=='#111111')throw Error('PDF_TEXT_COLOR_INVALID');continue;}
  if(op===OPS.setFillGray){if(Number(a[0])!==0)throw Error('PDF_TEXT_COLOR_INVALID');continue;}
  if(op===OPS.setLineWidth){state.width=Number(a[0]);continue;}
  if(op===OPS.setDash){state.dash=Array.from(a[0] as number[]);if(Number(a[1])!==0)throw Error('PDF_DASH_INVALID');continue;}
  if(op===OPS.clip){pendingClip=true;continue;}
  if(op===OPS.constructPath){
   const paint=Number(a[0]),data=(a[1] as Float32Array[])[0];if(!data)throw Error('PDF_PATH_INVALID');
   const curves:PrintCurve[]=[];let current:PrintPoint|undefined,start:PrintPoint|undefined;
   for(let j=0;j<data.length;){const command=data[j++]!;
    if(command===0){current=point(data[j++]!,data[j++]!);start=current;}
    else if(command===1){if(!current)throw Error('PDF_PATH_INVALID');const end=point(data[j++]!,data[j++]!);curves.push({kind:'line',points:[current,end]});current=end;}
    else if(command===2){if(!current)throw Error('PDF_PATH_INVALID');const c1=point(data[j++]!,data[j++]!),c2=point(data[j++]!,data[j++]!),end=point(data[j++]!,data[j++]!);curves.push({kind:'cubic',points:[current,c1,c2,end]});current=end;}
    else if(command===4){if(!current||!start)throw Error('PDF_PATH_INVALID');if(current.x!==start.x||current.y!==start.y)curves.push({kind:'line',points:[current,start]});current=start;}
    else throw Error('PDF_PATH_OPERATOR_UNSUPPORTED');
   }
   if(pendingClip){
    if(paint!==OPS.endPath||curves.length!==4||curves.some(c=>c.kind!=='line'||!(near(c.points[0]!.x,c.points[1]!.x,.0001)||near(c.points[0]!.y,c.points[1]!.y,.0001))))throw Error('PDF_CLIP_INVALID');
    const pts=curves.flatMap(c=>c.points),xs=pts.map(p=>p.x),ys=pts.map(p=>p.y),x=Math.max(state.clip?.x??-Infinity,Math.min(...xs)),y=Math.max(state.clip?.y??-Infinity,Math.min(...ys));
    state.clip={x,y,width:Math.min(state.clip?state.clip.x+state.clip.width:Infinity,Math.max(...xs))-x,height:Math.min(state.clip?state.clip.y+state.clip.height:Infinity,Math.max(...ys))-y};pendingClip=false;
   }else if(paint===OPS.stroke)strokes.push({curves,color:state.color,dash:[...state.dash],clip:state.clip?{...state.clip}:null,width:state.width*Math.hypot(state.matrix[0],state.matrix[1])*unit/MM});
   else throw Error('PDF_PAINT_OPERATOR_UNSUPPORTED');
   continue;
  }
  if(!ignored.has(op))throw Error('PDF_OPERATOR_UNSUPPORTED: '+op);
 }
 if(stack.length||pendingClip)throw Error('PDF_GRAPHICS_STATE_INVALID');return strokes;
}
/** Decode actual operators, transforms and clipping independently of PDFKit.
 * No embedded manifest is trusted as geometric evidence. */
export async function verifyPrintPdf(bytes:Uint8Array,input:unknown,preparationId:string,profileId:string=PDF_PROFILE.id):Promise<PdfMeasurement>{
 if(profileId!==PDF_PROFILE.id)throw Error('EXPORT_PROFILE_UNSUPPORTED');
 if(!bytes.length||bytes.length>100000000||!Buffer.from(bytes.subarray(-16)).toString('ascii').includes('%%EOF'))throw Error('PDF_INCOMPLETE');
 const scene=printScene(input,preparationId),layout=scene.layout;
 const task=getDocument({data:Uint8Array.from(bytes),useSystemFonts:false,disableFontFace:true,disableAutoFetch:true,disableStream:true,stopAtErrors:true});
 try{
  const pdf=await task.promise;if(pdf.numPages!==layout.pageCount||await pdf.getJSActions()||await pdf.getAttachments())throw Error('PDF_DOCUMENT_UNSAFE_OR_MISMATCH');
  const pages:PdfMeasurement['pages'][number][]=[];
  for(let i=1;i<=pdf.numPages;i++){
   const page=await pdf.getPage(i),viewport=page.getViewport({scale:1}),width=viewport.width/MM,height=viewport.height/MM;
   if(!near(width,layout.pageWidth,.005)||!near(height,layout.pageHeight,.005)||page.rotate!==0||await page.getJSActions()||(await page.getAnnotations()).length)throw Error('PDF_PAGE_MISMATCH');
   const ops=await page.getOperatorList(),strokes=decode(ops.fnArray,ops.argsArray as unknown[][],height,page.userUnit);
   const tile=layout.mode==='tiled'?layout.tiles.find(t=>t.page===i):undefined;
   const auxiliary:Stroke[]=[],stroke=(curves:PrintCurve[],color='#000000',dash:number[]=[],width=.15)=>auxiliary.push({curves,color,dash,width,clip:null});
   const legend=(x:number,y:number)=>{stroke([line(x,y+2,x+12,y+2)],'#075985',[2,1]);stroke([line(x,y+7,x+12,y+7)]);};
   if(layout.mode==='large'){const {x,y}=layout.auxiliary;legend(x,y+8);stroke(rectangle(x,y+18,100,100),'#000000',[],.2);}
   else if(i===1){const margin=layout.tiles[0]!.paperOrigin.x;stroke(rectangle(margin,margin+12,100,100),'#000000',[],.2);legend(margin,margin+145);}
   else if(i===2){const m=layout.tiles[0]!.paperOrigin.x,cell=Math.min((layout.pageWidth-2*m)/layout.columns,(layout.pageHeight-2*m-35)/layout.rows,30);for(const t of layout.tiles)stroke(rectangle(m+(t.column-1)*cell,m+25+(t.row-1)*cell,cell,cell));}
   else if(tile){for(const x of [tile.paperOrigin.x+5,tile.paperOrigin.x+tile.width-5])for(const y of [tile.paperOrigin.y+5,tile.paperOrigin.y+tile.height-5])stroke([line(x-2,y,x+2,y),line(x,y-2,x,y+2)]);}
   const unClipped=strokes.filter(s=>!s.clip);if(unClipped.length!==auxiliary.length||unClipped.some((s,j)=>!sameStroke(s,auxiliary[j]!)))throw Error('PDF_AUXILIARY_MISMATCH');
   if(layout.mode==='large'||tile){
    const offset=layout.mode==='large'?layout.pieceOrigin:{x:tile!.paperOrigin.x-tile!.x,y:tile!.paperOrigin.y-tile!.y};
    const clip=layout.mode==='large'?{x:layout.pieceOrigin.x,y:layout.pieceOrigin.y,width:layout.pageWidth-2*layout.pieceOrigin.x,height:layout.auxiliary.y-layout.pieceOrigin.y}:{x:tile!.paperOrigin.x,y:tile!.paperOrigin.y,width:tile!.width,height:tile!.height};
    const contours=strokes.filter(s=>s.clip&&s.color!=='#555555');
    if(contours.length!==scene.pieces.length*2)throw Error('PDF_CONTOUR_COUNT_MISMATCH');
    scene.pieces.forEach((piece,index)=>{for(const [j,expected,color,dashed] of [[0,piece.base,'#075985',true],[1,piece.exterior,'#000000',false]] as const){const actual=contours[2*index+j]!;if(!boxMatch(actual.clip,clip)||actual.color!==color||!near(actual.width,.15,.001)||!curvesMatch(actual.curves,expected,offset)|| (dashed?(actual.dash.length!==2||!near(actual.dash[0]!,2,.001)||!near(actual.dash[1]!,1,.001)):actual.dash.length!==0))throw Error('PDF_GEOMETRY_MISMATCH');}});
    const marks=strokes.filter(s=>s.clip&&s.color==='#555555'),expectedMarks:PrintCurve[][]=[];
    for(const piece of scene.pieces){const [a,b]=piece.grainline;expectedMarks.push([line(a!.x,a!.y,b!.x,b!.y)]);const angle=Math.atan2(b!.y-a!.y,b!.x-a!.x);
     for(const [point,direction] of [[b!,angle],[a!,angle+Math.PI]] as const)for(const sign of [-1,1])expectedMarks.push([line(point.x,point.y,point.x-3*Math.cos(direction+sign*.4),point.y-3*Math.sin(direction+sign*.4))]);}
    if(marks.length!==expectedMarks.length||marks.some((s,j)=>!boxMatch(s.clip,clip)||s.dash.length!==0||!near(s.width,.15,.001)||!curvesMatch(s.curves,expectedMarks[j]!,offset)))throw Error('PDF_GRAINLINE_MISMATCH');
   }else if(strokes.some(s=>s.clip))throw Error('PDF_UNEXPECTED_CLIP');
   if(layout.mode==='large'||i===1){
    const calibration=strokes.some(s=>!s.clip&&s.curves.length===4&&s.curves.every(c=>c.kind==='line'&&near(Math.hypot(c.points[1]!.x-c.points[0]!.x,c.points[1]!.y-c.points[0]!.y),100,.005)));
    if(!calibration)throw Error('PDF_CALIBRATION_MISMATCH');
   }
   const text=(await page.getTextContent()).items.flatMap(item=>'str'in item?[item.str]:[]).join(' ');if((layout.mode==='large'||i===1||i>=3)&&!text.includes('1:1'))throw Error('PDF_SCALE_LABEL_MISSING');
   const normalize=(s:string)=>s.replace(/\s+/gu,' ').trim();
   if(layout.mode==='large')for(const piece of scene.pieces){if(!normalize(text).includes(normalize(`${piece.name} · Talla ${piece.sizeLabel} · Cortar ${piece.cutQuantity}`))||piece.fold&&!text.includes('Corte al doblez'))throw Error('PDF_PIECE_LABEL_MISSING');}
   pages.push({widthMm:width,heightMm:height});
  }
  return {exportProfileId:profileId,scale:1,pages};
 }finally{await task.destroy();}
}

