import { DocumentCommands } from '../../../../../packages/document/src/commands.js';
import type { DocumentCommand } from '../../../../../packages/document/src/commands.js';
import { createPiece } from '../../../../../packages/document/src/piece.js';
import type { Piece } from '../../../../../packages/document/src/piece.js';
import type { PatternDocument } from '../../../../../packages/document/src/schema.js';
import type { Coordinate } from '../../../../../packages/geometry/src/model.js';
import { finite } from '../../../../../packages/contracts/src/validation.js';
const uuid=()=>crypto.randomUUID();
export class CadTools {
  private history:DocumentCommands;
  private listeners=new Set<()=>void>();private version=0;
  private epoch=0;
  private editingLocked=false;
  get locked(){return this.editingLocked;}
  lockEditing(){if(this.editingLocked)throw Error('Hay una exportación en curso.');this.editingLocked=true;this.changed();return ()=>{this.editingLocked=false;this.changed();};}
  private editable(){if(this.editingLocked)throw Error('Espera o cancela la exportación antes de modificar el documento.');}
  selected:string|null=null;
  grid={spacing:10,snapGrid:false,snapEndpoints:false};
  unit:'mm'|'cm'='mm';zoom=1;viewCenter={x:0,y:0};
  pan(x:number,y:number){finite(x);finite(y);this.viewCenter={x,y};this.changed();}
  constructor(document?:PatternDocument){this.history=new DocumentCommands(document??{formatVersion:1,documentId:uuid(),revisionId:'0'.repeat(64),units:'mm',pieces:[],preparations:[]});}
  subscribe=(fn:()=>void)=>{this.listeners.add(fn);return ()=>{this.listeners.delete(fn);};};
  getVersion=()=>this.version;
  private changed(){this.version++;for(const fn of this.listeners)fn();}
  document(){return this.history.snapshot();}
  get dirty(){return this.history.dirty;}
  get documentEpoch(){return this.epoch;}
  markSaved(document:PatternDocument){this.history.markSaved(document);this.changed();}
  attachRemoteBinding(binding:NonNullable<PatternDocument['remoteBinding']>){if(JSON.stringify(this.document().remoteBinding)===JSON.stringify(binding))return;this.history.attachRemoteBinding(binding);this.changed();}
  markUnsaved(){this.history.markUnsaved();this.epoch++;this.changed();}
  loadSaved(document:PatternDocument,expectedVersion:number){
    this.editable();
    if(this.version!==expectedVersion)throw Error('El documento cambió mientras se abría el archivo. Se conservan tus cambios.');
    const history=new DocumentCommands(document);this.history=history;this.epoch++;this.selected=null;this.changed();
  }
  recover(document:PatternDocument,expectedVersion:number){
    this.editable();
    if(this.version!==expectedVersion||this.dirty)throw Error('El documento actual cambió. Conserva sus cambios antes de recuperar otra copia.');
    const history=new DocumentCommands(document);history.markUnsaved();this.history=history;this.epoch++;this.selected=null;this.changed();
  }
  resolveConflict(document:PatternDocument,expectedVersion:number){
    this.editable();
    if(this.version!==expectedVersion)throw Error('El documento cambió durante la resolución. Se conservan tus cambios y el respaldo creado.');
    const history=new DocumentCommands(document);history.markUnsaved();this.history=history;this.epoch++;this.selected=null;this.changed();
  }
  create(confirmed=false){this.editable();if(this.dirty&&!confirmed)throw new Error('Confirma antes de descartar el documento modificado.');this.history=new DocumentCommands({formatVersion:1,documentId:uuid(),revisionId:'0'.repeat(64),units:'mm',pieces:[],preparations:[]});this.epoch++;this.selected=null;this.changed();}
  get canUndo(){return this.history.canUndo;}
  get canRedo(){return this.history.canRedo;}
  piece():Piece {const p=this.document().pieces.find(p=>p.id===this.selected);if(!p)throw new Error('Selecciona una pieza.');return p;}
  select(id:string){if(!this.document().pieces.some(p=>p.id===id))throw new Error('La pieza no existe.');this.selected=id;this.changed();}
  execute(c:DocumentCommand){this.editable();this.history.execute(c);this.changed();}
  undo(){this.editable();this.history.undo();this.changed();}
  redo(){this.editable();this.history.redo();this.changed();}
  draw(vertices:readonly(readonly[number,number])[],kinds:readonly('line'|'cubic')[]=[]){
    const points=vertices.map(([x,y])=>({id:uuid(),x,y})),p=createPiece(uuid(),{points,segments:points.slice(1).map((v,i)=>{
      const a=points[i]!,base={id:uuid(),startId:a.id,endId:v.id};
      return kinds[i]==='cubic'?{...base,kind:'cubic' as const,handleStart:{x:a.x+(v.x-a.x)/3,y:a.y+(v.y-a.y)/3},handleEnd:{x:a.x+2*(v.x-a.x)/3,y:a.y+2*(v.y-a.y)/3}}:{...base,kind:'line' as const};
    })});
    this.execute({type:'addPiece',piece:p});this.selected=p.id;this.changed();return p.id;
  }
  point(index:number,x:number,y:number){const p=this.piece(),point=p.contour.points[index];if(!point)throw new Error('Punto inexistente.');this.execute({type:'point',pieceId:p.id,pointId:point.id,position:{x,y}});}
  shiftPoint(index:number,dx:number,dy:number){const p=this.piece(),point=p.contour.points[index];if(!point)throw new Error('Punto inexistente.');this.execute({type:'shiftPoint',pieceId:p.id,pointId:point.id,dx,dy});}
  dragPoint(index:number,x:number,y:number){finite(x);finite(y);const p=this.piece();let target:Coordinate={x,y};
    // Screen-space capture radius is a presentation choice, never a topological epsilon.
    if(this.grid.snapEndpoints){const candidates=p.contour.points.filter((_,i)=>i!==index).map(v=>({v,d:Math.hypot(v.x-x,v.y-y)})).sort((a,b)=>a.d-b.d);if(candidates[0]&&candidates[0].d<=8/this.zoom)target={x:candidates[0].v.x,y:candidates[0].v.y};else if(this.grid.snapGrid)target=this.toGrid(target);}
    else if(this.grid.snapGrid)target=this.toGrid(target);
    this.point(index,target.x,target.y);
  }
  private toGrid(p:Coordinate){return {x:Math.round(p.x/this.grid.spacing)*this.grid.spacing,y:Math.round(p.y/this.grid.spacing)*this.grid.spacing};}
  configureGrid(spacing:number,snapGrid:boolean,snapEndpoints:boolean){finite(spacing);if(spacing<=0||typeof snapGrid!=='boolean'||typeof snapEndpoints!=='boolean')throw new Error('La cuadrícula requiere una separación positiva.');this.grid={spacing,snapGrid,snapEndpoints};this.changed();}
  view(unit:'mm'|'cm',zoom:number){finite(zoom);if(zoom<=0||!['mm','cm'].includes(unit))throw new Error('Vista inválida.');this.unit=unit;this.zoom=zoom;this.changed();}
  handle(index:number,end:'start'|'end',x:number,y:number){const p=this.piece(),s=p.contour.segments[index];if(!s)throw new Error('Tramo inexistente.');this.execute({type:'handle',pieceId:p.id,segmentId:s.id,end,position:{x,y}});}
  closeContour(kind:'line'|'cubic'='line'){this.execute({type:'close',pieceId:this.piece().id,kind});}
  extend(x:number,y:number,kind:'line'|'cubic'='line'){
    const position=this.snapPosition({x,y});this.execute({type:'extendContour',pieceId:this.piece().id,position,kind});
  }
  snapPosition(p:Coordinate):Coordinate{
    finite(p.x);finite(p.y);
    if(this.grid.snapEndpoints){const nearest=this.document().pieces.flatMap(p=>p.contour.points).map(v=>({v,d:Math.hypot(v.x-p.x,v.y-p.y)})).sort((a,b)=>a.d-b.d)[0];if(nearest&&nearest.d<=8/this.zoom)return {x:nearest.v.x,y:nearest.v.y};}
    return this.grid.snapGrid?this.toGrid(p):p;
  }
  curve(index:number){
    const p=this.piece(),s=p.contour.segments[index];if(!s)throw Error('Selecciona un tramo.');if(s.kind==='cubic')return;
    const a=p.contour.points.find(v=>v.id===s.startId)!,b=p.contour.points.find(v=>v.id===s.endId)!,dx=b.x-a.x,dy=b.y-a.y;
    this.execute({type:'segment',pieceId:p.id,segment:{...s,kind:'cubic',handleStart:{x:a.x+dx/3-dy/4,y:a.y+dy/3+dx/4},handleEnd:{x:a.x+2*dx/3-dy/4,y:a.y+2*dy/3+dx/4}}});
  }
  addPoint(after:number,x:number,y:number){
    const p=this.piece(),s=p.contour.segments[after];if(!s)throw new Error('Tramo inexistente.');
    this.execute({type:'insertPoint',pieceId:p.id,segmentId:s.id,t:.5,position:{x,y}});
  }
  removePoint(index:number,confirmed:boolean){const p=this.piece(),v=p.contour.points[index];if(!v)throw new Error('Punto inexistente.');this.execute({type:'removePoint',pieceId:p.id,pointId:v.id,confirmed});}
  move(dx:number,dy:number){this.execute({type:'move',pieceId:this.piece().id,dx,dy});}
  rotate(degrees:number,cx:number,cy:number){this.execute({type:'rotate',pieceId:this.piece().id,degrees,center:{x:cx,y:cy}});}
  reflect(a:readonly[number,number],b:readonly[number,number]){this.execute({type:'reflect',pieceId:this.piece().id,start:{x:a[0],y:a[1]},end:{x:b[0],y:b[1]}});}
  duplicate(){const before=this.document();this.execute({type:'duplicate',pieceId:this.piece().id});const id=this.document().pieces.find(p=>!before.pieces.some(v=>v.id===p.id))!.id;this.selected=id;this.changed();return id;}
  deletePiece(confirmed:boolean){this.execute({type:'deletePiece',pieceId:this.piece().id,confirmed});}
  margin(width:number|null){this.execute({type:'margin',pieceId:this.piece().id,width});}
  corner(pointId:string,join:'round'|'miter'){this.execute({type:'corner',pieceId:this.piece().id,pointId,join});}
  properties(properties:Pick<Piece,'name'|'sizeLabel'|'cutQuantity'|'grainline'|'fold'>){this.execute({type:'properties',pieceId:this.piece().id,properties});}
}

