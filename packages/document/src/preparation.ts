import type { PatternDocument } from './schema.js';
import { finite,uuid } from '../../contracts/src/validation.js';
export interface PrintTransform {x:number;y:number;rotation:number}
export interface Preparation extends Record<string,unknown> {id:string;name:string;selection:string[];transforms:Record<string,PrintTransform>;mode:'large'|'tiled';paper:'A4'|'Letter';margin:number}
export type PreparationCommand=
  | {type:'preparation.create';name:string;selection:string[]}
  | {type:'preparation.rename';id:string;name:string}
  | {type:'preparation.duplicate';id:string;name:string|null}
  | {type:'preparation.delete';id:string;confirmed:boolean}
  | {type:'preparation.select';id:string;selection:string[]}
  | {type:'preparation.transform';id:string;pieceId:string;transform:PrintTransform}
  | {type:'preparation.configure';id:string;mode:'large'|'tiled';paper:'A4'|'Letter';margin:number};
export function isPreparationCommand(input:{type:string}):input is PreparationCommand{return input.type.startsWith('preparation.');}
const normalized=(name:string)=>name.trim().toLowerCase();
function uniqueName(doc:PatternDocument,name:string,except?:string){if(typeof name!=='string'||!normalized(name)||doc.preparations.some(p=>p.id!==except&&normalized(p.name as string)===normalized(name)))throw new Error('PREPARATION_NAME_INVALID');return name.trim();}
function selection(doc:PatternDocument,ids:string[],existing:readonly string[]=[]){
  if(!Array.isArray(ids)||!ids.length||new Set(ids).size!==ids.length)throw new Error('PREPARATION_SELECTION_INVALID');
  for(const id of ids){uuid(id);if(!existing.includes(id)&&!doc.pieces.some(p=>p.id===id))throw new Error('PREPARATION_PIECE_MISSING');}return [...ids];
}
/** Mutates only a disposable command snapshot. Final document validation and
 * session undo/redo are owned by DocumentCommands, together with CAD edits. */
export function applyPreparation(doc:PatternDocument,input:PreparationCommand,newId:()=>string){
  if(input.type==='preparation.create'){
    const name=uniqueName(doc,input.name),selected=selection(doc,input.selection);
    doc.preparations.push({id:newId(),name,selection:selected,transforms:Object.fromEntries(selected.map(id=>[id,{x:0,y:0,rotation:0}])),mode:'tiled',paper:'A4',margin:10});return;
  }
  const p=doc.preparations.find(p=>p.id===input.id) as Preparation|undefined;if(!p)throw new Error('PREPARATION_NOT_FOUND');
  switch(input.type){
    case 'preparation.rename':p.name=uniqueName(doc,input.name,p.id);break;
    case 'preparation.duplicate':if(input.name!==null)doc.preparations.push({...structuredClone(p),id:newId(),name:uniqueName(doc,input.name)});break;
    case 'preparation.delete':if(input.confirmed)doc.preparations=doc.preparations.filter(v=>v.id!==p.id);break;
    case 'preparation.select':{
      const selected=selection(doc,input.selection,p.selection);p.transforms=Object.fromEntries(selected.map(id=>[id,p.transforms[id]??{x:0,y:0,rotation:0}]));p.selection=selected;break;
    }
    case 'preparation.transform':if(!p.selection.includes(input.pieceId))throw new Error('PREPARATION_SELECTION_INVALID');finite(input.transform.x);finite(input.transform.y);finite(input.transform.rotation);p.transforms[input.pieceId]=structuredClone(input.transform);break;
    case 'preparation.configure':finite(input.margin);if(input.margin<0||!['large','tiled'].includes(input.mode)||!['A4','Letter'].includes(input.paper))throw new Error('PREPARATION_CONFIGURATION_INVALID');p.mode=input.mode;p.paper=input.paper;p.margin=input.margin;break;
    default:throw new Error('PREPARATION_COMMAND_INVALID');
  }
}
export function preparationReferences(doc:PatternDocument,p:Preparation){return {missing:p.selection.filter(id=>!doc.pieces.some(piece=>piece.id===id)),available:doc.pieces.filter(piece=>!p.selection.includes(piece.id)).map(piece=>piece.id)};}
