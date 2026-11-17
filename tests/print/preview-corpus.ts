import { createPiece } from '../../packages/document/src/piece.js';
import type { PatternDocument } from '../../packages/document/src/schema.js';
import type { Contour } from '../../packages/geometry/src/model.js';
const id=(n:number)=>`80000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const document=(contours:Contour[]):PatternDocument=>({formatVersion:1,documentId:id(1),revisionId:'0'.repeat(64),units:'mm',preparations:[],pieces:contours.map((c,i)=>{
 const base=1000*(i+1),ids=new Map(c.points.map((p,k)=>[p.id,id(base+k+1)]));
 const piece=createPiece(id(base),{points:c.points.map(p=>({...p,id:ids.get(p.id)!})),segments:c.segments.map((s,k)=>({...s,id:id(base+100+k),startId:ids.get(s.startId)!,endId:ids.get(s.endId)!}))});
 piece.name=`Pieza ${i+1} ÁÉñ <doblez> & "texto"`;piece.sizeLabel='Única';return piece;
})});
const polygon=(points:number[][],close=true):Contour=>({points:points.map(([x,y],i)=>({id:String(i),x:x!,y:y!})),segments:points.slice(0,close?points.length:-1).map((_,i)=>({id:`s${i}`,kind:'line',startId:String(i),endId:String((i+1)%points.length)}))});
const cubic:Contour={points:[{id:'a',x:-30,y:0},{id:'b',x:30,y:0}],segments:[{id:'c',kind:'cubic',startId:'a',endId:'b',handleStart:{x:-20,y:80},handleEnd:{x:20,y:-80}},{id:'l',kind:'line',startId:'b',endId:'a'}]};
export function previewCorpus(){return [
 {name:'empty',document:document([])},
 {name:'unicode-rectangle',document:document([polygon([[0,0],[40,0],[40,30],[0,30]])])},
 {name:'tiny',document:document([polygon([[0,0],[2**-600,0],[0,2**-600]])])},
 {name:'large',document:document([polygon([[0,0],[5000,0],[2500,4999]])])},
 {name:'cubic',document:document([cubic])},
 {name:'open-draft',document:document([polygon([[0,0],[40,0],[40,30]],false)])},
 {name:'crossed-draft',document:document([polygon([[0,0],[40,30],[0,30],[40,0]])])},
 {name:'zero-length-draft',document:document([polygon([[0,0],[0,0],[0,0]])])},
 {name:'extreme-coordinates',document:document([polygon([[-1e308,-1e308],[1e308,-1e308],[1e308,1e308]])])},
 {name:'hundred-pieces',document:document(Array.from({length:100},(_,i)=>polygon([[i*40,0],[i*40+20,0],[i*40+20,30],[i*40,30]])))},
];}
