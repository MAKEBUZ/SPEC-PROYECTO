import {randomUUID as id} from 'node:crypto';
import {createPiece} from '../../packages/document/src/piece.js';
import {revisionId} from '../../packages/document/src/revision.js';
export function pdfFixture(mode:'large'|'tiled'='large',paper:'A4'|'Letter'='A4',size=100){
 const points=[[0,0],[size,0],[size,size],[0,size]].map(([x,y])=>({id:id(),x:x!,y:y!}));
 const piece=createPiece(id(),{points,segments:points.map((p,i)=>({id:id(),kind:'line',startId:p.id,endId:points[(i+1)%4]!.id}))});
 piece.name='Delantero';piece.sizeLabel='M';piece.cutQuantity=2;piece.grainline={start:{x:20,y:20},end:{x:20,y:60}};piece.fold=true;piece.seamWidth=10;
 const preparation={id:id(),name:'Impresión',selection:[piece.id],transforms:{[piece.id]:{x:0,y:0,rotation:0}},mode,paper,margin:10};
 const document={formatVersion:1 as const,documentId:id(),revisionId:'0'.repeat(64),units:'mm' as const,pieces:[piece],preparations:[preparation]};document.revisionId=revisionId(document);return {document,preparation};
}
