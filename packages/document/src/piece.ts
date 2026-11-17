import { finite, keys, object, oneOf, text, uuid, ValidationError } from '../../contracts/src/validation.js';
import { assertCoordinate, assertContour } from '../../geometry/src/model.js';
import type { Contour, Coordinate, CornerJoin } from '../../geometry/src/model.js';

export interface Piece {
  id:string; name:string; sizeLabel:string; cutQuantity:number|null;
  contour:Contour; seamWidth:number|null; cornerJoins:Record<string,CornerJoin>;
  grainline:{start:Coordinate;end:Coordinate}|null; fold:boolean;
}
/** Structural validation accepts incomplete and geometrically invalid drafts. */
export function assertPiece(input:unknown): asserts input is Piece {
  const p=object(input); keys(p,['id','name','sizeLabel','cutQuantity','contour','seamWidth','grainline','fold','cornerJoins']);
  uuid(p.id); text(p.name); text(p.sizeLabel); assertContour(p.contour);
  if(p.cutQuantity!==null) finite(p.cutQuantity);
  if(p.seamWidth!==null) { finite(p.seamWidth); if(p.seamWidth<0) throw new ValidationError('DOCUMENT_INVALID'); }
  oneOf(p.fold,[true,false]);
  if(p.grainline!==null) { const line=object(p.grainline); keys(line,['start','end']); assertCoordinate(line.start); assertCoordinate(line.end); }
  const pointIds=new Set(p.contour.points.map(point=>point.id));
  if(pointIds.has(p.id)||p.contour.segments.some(s=>s.id===p.id)) throw new ValidationError('DOCUMENT_INVALID','Hay identificadores repetidos.');
  for(const [id,join] of Object.entries(object(p.cornerJoins))) {
    if(!pointIds.has(id)) throw new ValidationError('DOCUMENT_INVALID'); oneOf(join,['round','miter']);
  }
}
/** Explicit creation/editing helper, never called implicitly during file reads. */
export function withCornerDefaults(piece:Piece):Piece {
  assertPiece(piece); const result=structuredClone(piece);
  for(const point of result.contour.points) if(!Object.hasOwn(result.cornerJoins,point.id)) result.cornerJoins[point.id]='miter';
  return result;
}
export function createPiece(id:string,contour:Contour={points:[],segments:[]}):Piece {
  return withCornerDefaults({id,name:'',sizeLabel:'',cutQuantity:null,contour,seamWidth:null,grainline:null,fold:false,cornerJoins:{}});
}
export type MetadataIssue = 'name'|'sizeLabel'|'cutQuantity'|'grainline';
/** FR-279 only. An empty result does not imply geometric validity or exportability. */
export function productionMetadataIssues(piece:Piece):MetadataIssue[] {
  assertPiece(piece); const issues:MetadataIssue[]=[];
  if(!piece.name.trim()) issues.push('name');
  if(!piece.sizeLabel.trim()) issues.push('sizeLabel');
  if(piece.cutQuantity===null||!Number.isInteger(piece.cutQuantity)||piece.cutQuantity<=0) issues.push('cutQuantity');
  if(!piece.grainline||(piece.grainline.start.x===piece.grainline.end.x&&piece.grainline.start.y===piece.grainline.end.y)) issues.push('grainline');
  return issues;
}
