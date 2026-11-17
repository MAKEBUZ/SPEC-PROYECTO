import type {Piece} from '../../document/src/piece.js';
/** Identity-free geometry key. Coordinates are not rounded; endpoint identity
 * remains represented by point index, including disconnected coincident points.
 * Caches using this key must live only inside one immutable evaluation. */
export function shapeKey(piece:Piece){
 const points=new Map(piece.contour.points.map((p,i)=>[p.id,i]));
 return JSON.stringify({points:piece.contour.points.map(p=>[p.x,p.y]),segments:piece.contour.segments.map(s=>[s.kind,points.get(s.startId),points.get(s.endId),...'handleStart'in s?[s.handleStart,s.handleEnd]:[]]),width:piece.seamWidth,joins:piece.cornerJoins?Object.entries(piece.cornerJoins).map(([id,style])=>[points.get(id)??id,style]).sort((a,b)=>String(a[0]).localeCompare(String(b[0]))):null});
}
