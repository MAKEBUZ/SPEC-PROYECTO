import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import type {Readable} from 'node:stream';
import {EXPORT_PROFILE} from './profile.js';
import {printScene,type PrintCurve,type PrintScene} from './scene.js';
import type {PdfMeasurement} from '../../document/src/pdf-artifact.js';
export const PDF_PROFILE=Object.freeze({id:'patronaje-pdf-1',pdfkit:'0.20.2',fontSha256:EXPORT_PROFILE.fontSha256,marginErrorMm:.005});
interface Writer extends Readable {
 addPage(options:Record<string,unknown>):this;save():this;restore():this;scale(n:number):this;translate(x:number,y:number):this;
 rect(x:number,y:number,w:number,h:number):this;clip():this;moveTo(x:number,y:number):this;lineTo(x:number,y:number):this;bezierCurveTo(a:number,b:number,c:number,d:number,e:number,f:number):this;
 lineWidth(n:number):this;strokeColor(s:string):this;fillColor(s:string):this;stroke():this;dash(n:number,o?:{space:number}):this;undash():this;
 font(bytes:Buffer):this;fontSize(n:number):this;text(s:string,x:number,y:number,options?:Record<string,unknown>):this;end():void;
 widthOfString(s:string):number;currentLineHeight(includeGap?:boolean):number;
}
const PdfDocument=createRequire(import.meta.url)('pdfkit') as new(options:Record<string,unknown>)=>Writer;
const MM=72/25.4;
function path(pdf:Writer,curves:PrintCurve[]){for(const c of curves){const p=c.points;pdf.moveTo(p[0]!.x,p[0]!.y);if(c.kind==='line')pdf.lineTo(p[1]!.x,p[1]!.y);else pdf.bezierCurveTo(p[1]!.x,p[1]!.y,p[2]!.x,p[2]!.y,p[3]!.x,p[3]!.y);}pdf.stroke();}
function text(pdf:Writer,s:string,x:number,y:number,size=3){pdf.fillColor('#111111').fontSize(size).text(s,x,y,{lineBreak:false});}
function cross(pdf:Writer,x:number,y:number){pdf.moveTo(x-2,y).lineTo(x+2,y).moveTo(x,y-2).lineTo(x,y+2).stroke();}
function calibration(pdf:Writer,x:number,y:number){pdf.undash().strokeColor('#000000').lineWidth(.2).rect(x,y,100,100).stroke();text(pdf,'Cuadrado de prueba: 100 × 100 mm',x,y+102);text(pdf,'Cada lado debe medir de 99,5 a 100,5 mm.',x,y+107);}
function legend(pdf:Writer,x:number,y:number){
 pdf.lineWidth(.15).strokeColor('#075985').dash(2,{space:1}).moveTo(x,y+2).lineTo(x+12,y+2).stroke();text(pdf,'Contorno base',x+15,y);
 pdf.undash().strokeColor('#000000').moveTo(x,y+7).lineTo(x+12,y+7).stroke();text(pdf,'Exterior del margen',x+15,y+5);
}
function pieces(pdf:Writer,scene:PrintScene,viewport:{x:number;y:number;width:number;height:number},offset:{x:number;y:number},avoidMarks=false){
 pdf.save().rect(viewport.x,viewport.y,viewport.width,viewport.height).clip().translate(offset.x,offset.y);
 for(const piece of scene.pieces){
  pdf.lineWidth(.15).strokeColor('#075985').dash(2,{space:1});path(pdf,piece.base);
  pdf.undash().strokeColor('#000000');path(pdf,piece.exterior);
  const [a,b]=piece.grainline;pdf.strokeColor('#555555').moveTo(a!.x,a!.y).lineTo(b!.x,b!.y).stroke();
  const angle=Math.atan2(b!.y-a!.y,b!.x-a!.x);for(const [point,direction] of [[b!,angle],[a!,angle+Math.PI]] as const){for(const sign of [-1,1])pdf.moveTo(point.x,point.y).lineTo(point.x-3*Math.cos(direction+sign*.4),point.y-3*Math.sin(direction+sign*.4)).stroke();}
  const label=`${piece.name} · Talla ${piece.sizeLabel} · Cortar ${piece.cutQuantity}`;
  pdf.fontSize(3);
  const labelWidth=Math.max(pdf.widthOfString(label),piece.fold?pdf.widthOfString('Corte al doblez'):0);
  const labelHeight=pdf.currentLineHeight(true)+(piece.fold?4:0);
  let labelY=piece.label.y;
  if(avoidMarks){
   // Reserve the full 4 mm cross plus 1 mm clearance. Move only the
   // annotation, never the production contours or registration marks.
   const left=piece.label.x+offset.x,right=left+labelWidth;
   for(const x of [viewport.x+5,viewport.x+viewport.width-5])for(const y of [viewport.y+5,viewport.y+viewport.height-5]){
    const top=labelY+offset.y;
    if(left<x+3&&right>x-3&&top<y+3&&top+labelHeight>y-3)
     labelY=(y<viewport.y+viewport.height/2?y+3:y-3-labelHeight)-offset.y;
   }
  }
  text(pdf,label,piece.label.x,labelY);
  if(piece.fold)text(pdf,'Corte al doblez',piece.label.x,labelY+4);
 }
 pdf.restore();
}
/** Generates only. A caller must independently verify these bytes before
 * registering a PdfArtifact, exporting or publishing them. */
export async function createPrintPdf(input:unknown,preparationId:string,assets:{font:Uint8Array}){
 if(createHash('sha256').update(assets.font).digest('hex')!==PDF_PROFILE.fontSha256)throw Error('PDF_FONT_MISMATCH');
 const scene=printScene(input,preparationId),layout=scene.layout,date=new Date('2000-01-01T00:00:00.000Z');
 const pdf=new PdfDocument({autoFirstPage:false,compress:false,pdfVersion:'1.7',info:{Title:'Patronaje — impresión 1:1',Creator:PDF_PROFILE.id,Producer:`PDFKit ${PDF_PROFILE.pdfkit}`,CreationDate:date,ModDate:date,Subject:JSON.stringify(scene.origin)}});
 const chunks:Buffer[]=[];const bytes=new Promise<Uint8Array>((resolve,reject)=>{pdf.on('data',(chunk:Buffer)=>chunks.push(Buffer.from(chunk)));pdf.on('error',reject);pdf.on('end',()=>resolve(Buffer.concat(chunks)));});
 pdf.font(Buffer.from(assets.font));
 const newPage=()=>{const unit=Math.max(1,Math.ceil(Math.max(layout.pageWidth,layout.pageHeight)*MM/14000));pdf.addPage({size:[layout.pageWidth*MM/unit,layout.pageHeight*MM/unit],userUnit:unit,margin:0}).save().scale(MM/unit);};
 if(layout.mode==='large'){
  newPage();pieces(pdf,scene,{x:layout.pieceOrigin.x,y:layout.pieceOrigin.y,width:layout.pageWidth-2*layout.pieceOrigin.x,height:layout.auxiliary.y-layout.pieceOrigin.y},layout.pieceOrigin);
  const {x,y}=layout.auxiliary;text(pdf,'Escala 1:1 · Imprimir al 100 %, sin ajustar a la página.',x,y+2);legend(pdf,x,y+8);calibration(pdf,x,y+18);pdf.restore();
 }else{
  const margin=layout.tiles[0]!.paperOrigin.x;
  newPage();text(pdf,'Prueba de impresión · Escala 1:1',margin,margin,4);calibration(pdf,margin,margin+12);text(pdf,'Imprimir al 100 %, sin ajustar a la página.',margin,margin+130);text(pdf,'Verifica la medida antes de imprimir las piezas.',margin,margin+136);legend(pdf,margin,margin+145);pdf.restore();
  newPage();text(pdf,'Esquema de montaje',margin,margin,4);text(pdf,`Filas: ${layout.rows} · Columnas: ${layout.columns} · Solape: 10 mm`,margin,margin+8);text(pdf,'Recorta y alinea las marcas; conserva el tamaño real.',margin,margin+14);
  const cell=Math.min((layout.pageWidth-2*margin)/layout.columns,(layout.pageHeight-2*margin-35)/layout.rows,30);
  pdf.lineWidth(.15).strokeColor('#000000');for(const tile of layout.tiles){const x=margin+(tile.column-1)*cell,y=margin+25+(tile.row-1)*cell;pdf.rect(x,y,cell,cell).stroke();text(pdf,`${tile.row}-${tile.column}`,x+.5,y+.5,Math.min(3,cell/4));}pdf.restore();
  for(const tile of layout.tiles){newPage();pieces(pdf,scene,{x:tile.paperOrigin.x,y:tile.paperOrigin.y,width:tile.width,height:tile.height},{x:tile.paperOrigin.x-tile.x,y:tile.paperOrigin.y-tile.y},true);pdf.undash().strokeColor('#000000').lineWidth(.15);
   for(const x of [tile.paperOrigin.x+5,tile.paperOrigin.x+tile.width-5])for(const y of [tile.paperOrigin.y+5,tile.paperOrigin.y+tile.height-5])cross(pdf,x,y);
   text(pdf,`Fila ${tile.row} · Columna ${tile.column} · Escala 1:1`,Math.max(1,tile.paperOrigin.x),2,2.5);pdf.restore();}
 }
 pdf.end();const result=await bytes;
 const measurement:PdfMeasurement={exportProfileId:PDF_PROFILE.id,scale:1,pages:Array.from({length:layout.pageCount},()=>({widthMm:layout.pageWidth,heightMm:layout.pageHeight}))};
 return {bytes:result,measurement,origin:scene.origin};
}
