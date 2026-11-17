import { validateDocument } from './schema.js';
import type { PatternDocument } from './schema.js';
import { withCornerDefaults } from './piece.js';
import type { Piece } from './piece.js';
import { assertCoordinate, hasExplicitClosure } from '../../geometry/src/model.js';
import type { Coordinate, Segment, CornerJoin } from '../../geometry/src/model.js';
import { finite, uuid } from '../../contracts/src/validation.js';
import { applyPreparation,isPreparationCommand } from './preparation.js';
import { roundCorner } from '../../geometry/src/round-corner.js';
import type { PreparationCommand } from './preparation.js';

type Target={pieceId:string};
type Properties=Pick<Piece,'name'|'sizeLabel'|'cutQuantity'|'grainline'|'fold'>;
export type DocumentCommand=
  | PreparationCommand
  | {type:'addPiece';piece:Piece}
  | (Target & (
    {type:'point';pointId:string;position:Coordinate} |
    {type:'shiftPoint';pointId:string;dx:number;dy:number} |
    {type:'appendPoint';position:Coordinate} |
    {type:'extendContour';position:Coordinate;kind:'line'|'cubic'} |
    {type:'insertPoint';segmentId:string;t:number;position?:Coordinate} |
    {type:'removePoint';pointId:string;confirmed:boolean} |
    {type:'segment';segment:Segment} |
    {type:'handle';segmentId:string;end:'start'|'end';position:Coordinate} |
    {type:'close';kind?:'line'|'cubic'} |
    {type:'move';dx:number;dy:number} |
    {type:'rotate';degrees:number;center:Coordinate} |
    {type:'reflect';start:Coordinate;end:Coordinate} |
    {type:'duplicate'} |
    {type:'deletePiece';confirmed:boolean} |
    {type:'margin';width:number|null} |
    {type:'corner';pointId:string;join:CornerJoin} |
    {type:'roundPieceCorner';pointId:string;radius:number} |
    {type:'properties';properties:Properties}));

export class CommandError extends Error {constructor(readonly code:string){super(code);}}
interface Entry {before:PatternDocument;after:PatternDocument}
const clone=<T>(v:T):T=>structuredClone(v);
// Save metadata is not editable content; saving is handled by the file layer.
const content=(d:PatternDocument)=>JSON.stringify({units:d.units,pieces:d.pieces,preparations:d.preparations});
const required=<T>(v:T|undefined):T=>{if(v===undefined)throw new CommandError('ENTITY_NOT_FOUND');return v;};
const lerp=(a:Coordinate,b:Coordinate,t:number):Coordinate=>({x:(1-t)*a.x+t*b.x,y:(1-t)*a.y+t*b.y});

/** Session-local history. Owns its document and never exposes mutable state.
 * No network, filesystem, rendering, snapping or production validation here.
 * Invalid geometric drafts remain editable; structural failures are atomic.
 */
export class DocumentCommands {
  private current:PatternDocument;
  private past:Entry[]=[];
  private future:Entry[]=[];
  private saved:string|null;
  constructor(document:PatternDocument,private readonly newId:()=>string=()=>globalThis.crypto.randomUUID()){
    this.current=clone(validateDocument(document));this.saved=content(this.current);
  }
  snapshot():PatternDocument{return clone(this.current);}
  get canUndo():boolean{return this.past.length>0;}
  get canRedo():boolean{return this.future.length>0;}
  get dirty():boolean{return content(this.current)!==this.saved;}
  markUnsaved():void{this.saved=null;}
  attachRemoteBinding(binding:NonNullable<PatternDocument['remoteBinding']>):void{
    validateDocument({...this.current,remoteBinding:binding});this.current.remoteBinding=clone(binding);
    for(const entry of [...this.past,...this.future]){entry.before.remoteBinding=clone(binding);entry.after.remoteBinding=clone(binding);}
  }
  /** Call only after the file layer confirms saving this exact snapshot.
   * An edit made during an asynchronous save remains dirty. */
  markSaved(document:PatternDocument=this.snapshot()):void{
    validateDocument(document);if(document.documentId!==this.current.documentId)throw new CommandError('DOCUMENT_MISMATCH');
    this.saved=content(document);this.current={...this.current,revisionId:document.revisionId};
  }
  undo():boolean{
    const entry=this.past.pop();if(!entry)return false;
    this.current={...clone(entry.before),revisionId:this.current.revisionId};this.future.push(entry);return true;
  }
  redo():boolean{
    const entry=this.future.pop();if(!entry)return false;
    this.current={...clone(entry.after),revisionId:this.current.revisionId};this.past.push(entry);return true;
  }
  execute(command:DocumentCommand):boolean{
    // Copy both inputs before work; a caller cannot later mutate history.
    const input=clone(command),next=clone(this.current);
    const used=new Set([next.documentId,...next.preparations.map(p=>p.id as string),...next.pieces.flatMap(p=>[p.id,...p.contour.points.map(p=>p.id),...p.contour.segments.map(s=>s.id)])]);
    const identity=()=>{const id=this.newId();uuid(id);if(used.has(id))throw new CommandError('IDENTITY_COLLISION');used.add(id);return id;};
    if(isPreparationCommand(input))applyPreparation(next,input,identity);
    else if(input.type==='addPiece')next.pieces.push(withCornerDefaults(input.piece));
    else{
      const p=required(next.pieces.find(p=>p.id===input.pieceId)),c=p.contour;
      const point=(id:string)=>required(c.points.find(v=>v.id===id));
      const transform=(map:(v:Coordinate)=>Coordinate)=>{
        const mapped=new Map<string,Coordinate>();
        const checked=(v:Coordinate)=>{
          const result=map(v);assertCoordinate(result);
          const key=JSON.stringify(result),prior=mapped.get(key);
          if(prior&&(prior.x!==v.x||prior.y!==v.y))throw new CommandError('TRANSFORM_PRECISION_LOSS');
          mapped.set(key,v);return result;
        };
        c.points=c.points.map(v=>({...v,...checked(v)}));
        c.segments=c.segments.map(s=>s.kind==='cubic'?{...s,handleStart:checked(s.handleStart),handleEnd:checked(s.handleEnd)}:s);
        if(p.grainline)p.grainline={start:checked(p.grainline.start),end:checked(p.grainline.end)};
      };
      switch(input.type){
        case 'roundPieceCorner':{
          const incoming=c.segments.filter(s=>s.endId===input.pointId),outgoing=c.segments.filter(s=>s.startId===input.pointId);
          if(incoming.length!==1||outgoing.length!==1||incoming[0]!.kind!=='line'||outgoing[0]!.kind!=='line')throw new Error('Elige una esquina entre dos tramos rectos. Los extremos abiertos y las uniones con curvas no se pueden redondear con esta herramienta.');
          const before=incoming[0]!,after=outgoing[0]!,corner=point(input.pointId);
          const rounded=roundCorner(point(before.startId),corner,point(after.endId),input.radius);
          const start={id:identity(),...rounded.start},points=[start],segments:Segment[]=[];
          for(const arc of rounded.arcs){const end={id:identity(),...arc.end};segments.push({id:identity(),kind:'cubic',startId:points.at(-1)!.id,endId:end.id,handleStart:arc.handleStart,handleEnd:arc.handleEnd});points.push(end);}
          before.endId=start.id;after.startId=points.at(-1)!.id;
          c.segments.splice(c.segments.indexOf(before)+1,0,...segments);
          c.points.splice(c.points.indexOf(corner),1,...points);delete p.cornerJoins[corner.id];
          for(const v of points)p.cornerJoins[v.id]='miter';
          break;
        }
        case 'point':assertCoordinate(input.position);Object.assign(point(input.pointId),input.position);break;
        case 'shiftPoint':{finite(input.dx);finite(input.dy);const v=point(input.pointId);v.x+=input.dx;v.y+=input.dy;break;}
        case 'appendPoint':{
          assertCoordinate(input.position);const id=identity();c.points.push({id,...input.position});p.cornerJoins[id]='miter';break;
        }
        case 'extendContour':{
          assertCoordinate(input.position);
          if(input.kind!=='line'&&input.kind!=='cubic')throw new CommandError('INVALID_SEGMENT_KIND');
          if(hasExplicitClosure(c))throw new CommandError('CONTOUR_ALREADY_CLOSED');
          if(c.segments.some((s,i)=>i>0&&c.segments[i-1]!.endId!==s.startId))throw new CommandError('NOT_A_CONNECTED_CHAIN');
          const a=c.segments.length?point(c.segments.at(-1)!.endId):required(c.points.at(-1));
          const id=identity(),b={id,...input.position};c.points.push(b);p.cornerJoins[id]='miter';
          const base={id:identity(),startId:a.id,endId:id};
          const dx=b.x-a.x,dy=b.y-a.y;
          c.segments.push(input.kind==='line'?{...base,kind:'line'}:{...base,kind:'cubic',handleStart:{x:a.x+dx/3-dy/4,y:a.y+dy/3+dx/4},handleEnd:{x:a.x+2*dx/3-dy/4,y:a.y+2*dy/3+dx/4}});
          break;
        }
        case 'segment':{
          const index=c.segments.findIndex(s=>s.id===input.segment.id);
          if(index<0)c.segments.push(input.segment);else c.segments[index]=input.segment;break;
        }
        case 'handle':{
          assertCoordinate(input.position);const s=required(c.segments.find(s=>s.id===input.segmentId));
          if(s.kind!=='cubic')throw new CommandError('NOT_A_CUBIC');
          if(input.end==='start')s.handleStart=input.position;else if(input.end==='end')s.handleEnd=input.position;else throw new CommandError('INVALID_HANDLE');break;
        }
        case 'insertPoint':{
          finite(input.t);if(input.t<=0||input.t>=1)throw new CommandError('INVALID_SPLIT_PARAMETER');
          const index=c.segments.findIndex(s=>s.id===input.segmentId),s=required(c.segments[index]),a=point(s.startId),b=point(s.endId),id=identity(),second=identity();
          let position:Coordinate;
          if(s.kind==='line'){
            position=lerp(a,b,input.t);c.segments.splice(index,1,{...s,endId:id},{...s,id:second,startId:id});
          }else{
            const v=lerp(a,s.handleStart,input.t),w=lerp(s.handleStart,s.handleEnd,input.t),z=lerp(s.handleEnd,b,input.t),left=lerp(v,w,input.t),right=lerp(w,z,input.t);
            position=lerp(left,right,input.t);
            c.segments.splice(index,1,{...s,endId:id,handleStart:v,handleEnd:left},{...s,id:second,startId:id,handleStart:right,handleEnd:z});
          }
          if(input.position!==undefined){assertCoordinate(input.position);position=input.position;}
          c.points.splice(c.points.findIndex(p=>p.id===a.id)+1,0,{id,...position});p.cornerJoins[id]='miter';break;
        }
        case 'removePoint':{
          if(input.confirmed!==true)return false;point(input.pointId);
          c.points=c.points.filter(p=>p.id!==input.pointId);c.segments=c.segments.filter(s=>s.startId!==input.pointId&&s.endId!==input.pointId);delete p.cornerJoins[input.pointId];break;
        }
        case 'close':{
          if(input.kind!==undefined&&input.kind!=='line'&&input.kind!=='cubic')throw new CommandError('INVALID_SEGMENT_KIND');
          if(hasExplicitClosure(c))return false;
          if(!c.segments.length||!c.segments.slice(1).every((s,i)=>c.segments[i]!.endId===s.startId))throw new CommandError('NOT_A_CONNECTED_CHAIN');
          const first=point(c.segments[0]!.startId),last=point(c.segments.at(-1)!.endId);
          if(first.x===last.x&&first.y===last.y){
            for(const s of c.segments){if(s.startId===last.id)s.startId=first.id;if(s.endId===last.id)s.endId=first.id;}
            c.points=c.points.filter(p=>p.id!==last.id);delete p.cornerJoins[last.id];
          }else {
            const base={id:identity(),startId:last.id,endId:first.id},dx=first.x-last.x,dy=first.y-last.y;
            c.segments.push(input.kind==='cubic'?{...base,kind:'cubic',handleStart:{x:last.x+dx/3-dy/4,y:last.y+dy/3+dx/4},handleEnd:{x:last.x+2*dx/3-dy/4,y:last.y+2*dy/3+dx/4}}:{...base,kind:'line'});
          }break;
        }
        case 'move':finite(input.dx);finite(input.dy);transform(v=>({x:v.x+input.dx,y:v.y+input.dy}));break;
        case 'rotate':{
          finite(input.degrees);assertCoordinate(input.center);const degrees=input.degrees%360;
          if(degrees===0)return false;
          const turns=degrees/90,quarter=Number.isInteger(turns),index=((turns%4)+4)%4,cos=quarter?[1,0,-1,0][index]!:Math.cos(degrees*Math.PI/180),sin=quarter?[0,1,0,-1][index]!:Math.sin(degrees*Math.PI/180);
          transform(v=>{const x=v.x-input.center.x,y=v.y-input.center.y;return {x:input.center.x+cos*x-sin*y,y:input.center.y+sin*x+cos*y};});break;
        }
        case 'reflect':{
          assertCoordinate(input.start);assertCoordinate(input.end);const dx=input.end.x-input.start.x,dy=input.end.y-input.start.y;finite(dx);finite(dy);
          const scale=Math.max(Math.abs(dx),Math.abs(dy));if(!scale)throw new CommandError('ZERO_REFLECTION_AXIS');
          const x=dx/scale,y=dy/scale,den=x*x+y*y,a=(x*x-y*y)/den,b=2*x*y/den;
          transform(v=>{const px=v.x-input.start.x,py=v.y-input.start.y;return {x:input.start.x+a*px+b*py,y:input.start.y+b*px-a*py};});break;
        }
        case 'duplicate':{
          const copy=clone(p),mapping=new Map(c.points.map(v=>[v.id,identity()]));copy.id=identity();
          copy.contour.points=copy.contour.points.map(v=>({...v,id:required(mapping.get(v.id))}));
          copy.contour.segments=copy.contour.segments.map(s=>({...s,id:identity(),startId:required(mapping.get(s.startId)),endId:required(mapping.get(s.endId))}));
          copy.cornerJoins=Object.fromEntries(Object.entries(copy.cornerJoins).map(([key,value])=>[required(mapping.get(key)),value]));next.pieces.push(copy);break;
        }
        case 'deletePiece':if(input.confirmed!==true)return false;next.pieces=next.pieces.filter(v=>v.id!==p.id);break;
        case 'margin':p.seamWidth=input.width;Object.assign(p,withCornerDefaults(p));break;
        case 'corner':point(input.pointId);p.cornerJoins[input.pointId]=input.join;break;
        case 'properties':{
          // Explicit allowlist: a metadata command cannot replace geometry/IDs.
          const v=input.properties;p.name=v.name;p.sizeLabel=v.sizeLabel;p.cutQuantity=v.cutQuantity;p.grainline=v.grainline;p.fold=v.fold;break;
        }
        default:throw new CommandError('UNKNOWN_COMMAND');
      }
    }
    validateDocument(next);
    if(content(next)===content(this.current))return false;
    this.past.push({before:this.current,after:next});this.future=[];this.current=next;return true;
  }
}
