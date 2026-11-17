import type { Piece } from '../../../../../packages/document/src/piece.js';
import { inspectContour } from '../../../../../packages/geometry/src/intersections.js';
import { approximateMargin } from '../../../../../packages/geometry/src/bounds.js';
import { productionMetadataIssues } from '../../../../../packages/document/src/piece.js';

export interface PiecePreview {
  id:string;
  issues:string[];
  invalidBase:boolean;
  margin:{x:number;y:number}[][];
}
/** Presentation only. Export always performs its own exact validation. */
export function calculatePreview(piece:Piece):PiecePreview {
  const result:PiecePreview={id:piece.id,issues:[],invalidBase:false,margin:[]};
  try {
    const base=inspectContour(piece.contour);
    result.invalidBase=base.defects.length>0;
    result.issues=[...base.defects,...productionMetadataIssues(piece)];
    const margin=approximateMargin(piece);
    if(margin.kind==='certified')result.margin=margin.segments.map(s=>[s.start,s.end].map(p=>({x:Number(p.x.n)/Number(p.x.d),y:Number(p.y.n)/Number(p.y.d)})));
    else if('defects' in margin)result.issues.push(...margin.defects);
  } catch {
    result.issues.push('No se pudo completar el cálculo geométrico. El borrador se conserva.');
  }
  return result;
}
