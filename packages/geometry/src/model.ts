import { array, finite, keys, object, oneOf, uuid, ValidationError } from '../../contracts/src/validation.js';

/** Canonical coordinates in millimetres. Rendering never owns these values. */
export interface Coordinate { x:number; y:number }
export interface Point extends Coordinate { id:string }
interface SegmentBase { id:string; startId:string; endId:string }
export interface LineSegment extends SegmentBase { kind:'line' }
export interface CubicSegment extends SegmentBase { kind:'cubic'; handleStart:Coordinate; handleEnd:Coordinate }
export type Segment = LineSegment | CubicSegment;
export interface Contour { points:Point[]; segments:Segment[] }
export type CornerJoin = 'round'|'miter';

export function assertCoordinate(input:unknown): asserts input is Coordinate {
  const p=object(input); keys(p,['x','y']); finite(p.x); finite(p.y);
}
export function assertContour(input:unknown): asserts input is Contour {
  const c=object(input); keys(c,['points','segments']);
  const points=array(c.points),segments=array(c.segments),ids=new Set<string>(),pointIds=new Set<string>();
  const identity=(value:unknown)=>{ uuid(value); if(ids.has(value)) throw new ValidationError('DOCUMENT_INVALID','Hay identificadores repetidos.'); ids.add(value); return value; };
  for(const inputPoint of points) {
    const p=object(inputPoint); keys(p,['id','x','y']); pointIds.add(identity(p.id)); finite(p.x); finite(p.y);
  }
  for(const inputSegment of segments) {
    const s=object(inputSegment); oneOf(s.kind,['line','cubic']);
    keys(s,['id','kind','startId','endId',...(s.kind==='cubic'?['handleStart','handleEnd']:[])]);
    identity(s.id); uuid(s.startId); uuid(s.endId);
    if(!pointIds.has(s.startId)||!pointIds.has(s.endId)) throw new ValidationError('DOCUMENT_INVALID','El segmento referencia un punto inexistente.');
    if(s.kind==='cubic') { assertCoordinate(s.handleStart); assertCoordinate(s.handleEnd); }
  }
}
/** Connectivity only: not a proof of area, simplicity or production validity. */
export function hasExplicitClosure(contour:Contour):boolean {
  assertContour(contour);
  const segments=contour.segments;
  return segments.length>0 && segments.every((s,i)=>s.endId===segments[(i+1)%segments.length]!.startId);
}
