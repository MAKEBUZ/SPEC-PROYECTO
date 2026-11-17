import {randomUUID} from 'node:crypto';
import {createPiece} from '../../packages/document/src/piece.js';
import {revisionId} from '../../packages/document/src/revision.js';
import type {PatternDocument} from '../../packages/document/src/schema.js';

/** Quickstart loads: segment count is per piece, with lines, a curve, margin
 * and cutting marks. Counts are test inputs, never new product limits. */
export function performanceDocument(pieceCount:number,segmentsPerPiece:number):PatternDocument{
 if(segmentsPerPiece%4||segmentsPerPiece<4)throw Error('CORPUS_SEGMENTS');
 const pieces=Array.from({length:pieceCount},(_,index)=>{
  const perSide=segmentsPerPiece/4;
  const points=Array.from({length:segmentsPerPiece},(_,i)=>{
   const side=Math.floor(i/perSide),t=(i%perSide)*100/perSide;
   const [x,y]=[[t,0],[100,t],[100-t,100],[0,100-t]][side]!;
   return {id:randomUUID(),x:x!,y:y!};
  });
  const piece=createPiece(randomUUID(),{points,segments:points.map((p,i)=>i===0?{id:randomUUID(),kind:'cubic',startId:p.id,endId:points[1]!.id,handleStart:{x:points[1]!.x/3,y:-1},handleEnd:{x:points[1]!.x*2/3,y:-1}}:{id:randomUUID(),kind:'line',startId:p.id,endId:points[(i+1)%points.length]!.id})});
  piece.name=`Pieza ${index+1}`;piece.sizeLabel='M';piece.cutQuantity=1;piece.seamWidth=1;
  piece.grainline={start:{x:50,y:20},end:{x:50,y:80}};piece.fold=true;
  return piece;
 });
 const document:PatternDocument={formatVersion:1,documentId:randomUUID(),revisionId:'0'.repeat(64),units:'mm',pieces,preparations:[]};
 document.revisionId=revisionId(document);return document;
}
export function printBoundaryDocument(mode:'maximum-format'|'250-pages'){
 const document=performanceDocument(mode==='maximum-format'?4:2,4);
 const width=mode==='maximum-format'?4999:2794,height=mode==='maximum-format'?4999:2146;
 for(const piece of document.pieces){
  piece.contour.points.forEach((p,i)=>{const v=[[0,0],[width,0],[width,height],[0,height]][i]!;p.x=v[0]!;p.y=v[1]!;});
  piece.contour.segments=piece.contour.segments.map(s=>({id:s.id,kind:'line',startId:s.startId,endId:s.endId}));piece.seamWidth=0;
 }
 const preparation={id:randomUUID(),name:mode,selection:document.pieces.map(p=>p.id),transforms:Object.fromEntries(document.pieces.map((p,i)=>[p.id,{x:(i%2)*(width+2),y:Math.floor(i/2)*(height+2),rotation:0}])),mode:mode==='maximum-format'?'large' as const:'tiled' as const,paper:'A4' as const,margin:10};
 document.preparations=[preparation];document.revisionId=revisionId(document);return {document,preparation};
}
