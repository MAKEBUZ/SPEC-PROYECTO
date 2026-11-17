import { assertContour, assertCoordinate } from './model.js';
import type { Contour, Coordinate, Segment } from './model.js';
import { add, subtract, multiply, fromNumber, rational } from './numeric.js';
import type { Rational } from './numeric.js';

export class ContourCalculationError extends Error {
  constructor(readonly code:'INVALID_CONTROL_COUNT'|'SEGMENT_NOT_FOUND') { super(`No se pudo analizar el contorno: ${code}`); this.name='ContourCalculationError'; }
}
export interface Bounds { readonly minX:number; readonly maxX:number; readonly minY:number; readonly maxY:number }
function checkControls(controls:readonly Coordinate[]) {
  if(controls.length!==2&&controls.length!==4) throw new ContourCalculationError('INVALID_CONTROL_COUNT');
  controls.forEach(assertCoordinate);
}
function controlsFor(segment:Segment,points:Map<string,Coordinate>):Coordinate[] {
  const a=points.get(segment.startId)!,b=points.get(segment.endId)!;
  return (segment.kind==='line'?[a,b]:[a,segment.handleStart,segment.handleEnd,b]).map(p=>({x:p.x,y:p.y}));
}
export function segmentControls(contour:Contour,segmentId:string):Coordinate[] {
  assertContour(contour); const segment=contour.segments.find(s=>s.id===segmentId);
  if(!segment) throw new ContourCalculationError('SEGMENT_NOT_FOUND');
  return controlsFor(segment,new Map(contour.points.map(p=>[p.id,p])));
}
/** A polynomial Bézier trajectory is constant iff every control is identical. */
export function isConstant(controls:readonly Coordinate[]):boolean {
  checkControls(controls); const first=controls[0]!;
  return controls.every(p=>p.x===first.x&&p.y===first.y);
}
function choose(n:number,k:number):bigint {
  let result=1n; for(let i=1;i<=k;i++) result=result*BigInt(n-i+1)/BigInt(i); return result;
}
/** Half integral of x dy - y dx. An open path has no implied closing segment.
 * Bernstein-product integration is independent of the power-basis test oracle.
 */
export function pathIntegral(paths:readonly (readonly Coordinate[])[]):Rational {
  let result=rational(0n);
  for(const controls of paths) {
    checkControls(controls); const n=controls.length-1;
    const p=controls.map(point=>({x:fromNumber(point.x),y:fromNumber(point.y)}));
    for(let i=0;i<=n;i++) for(let j=0;j<n;j++) {
      const dx=subtract(p[j+1]!.x,p[j]!.x),dy=subtract(p[j+1]!.y,p[j]!.y);
      const cross=subtract(multiply(p[i]!.x,dy),multiply(p[i]!.y,dx));
      const weight=rational(choose(n,i)*choose(n-1,j),4n*choose(2*n-1,i+j));
      result=add(result,multiply(cross,weight));
    }
  }
  return result;
}
/** Convex-hull enclosure, not a tight box or a production size decision. */
export function controlBounds(controls:readonly Coordinate[]):Bounds {
  checkControls(controls);
  let minX=controls[0]!.x,maxX=minX,minY=controls[0]!.y,maxY=minY;
  for(const p of controls) { minX=Math.min(minX,p.x); maxX=Math.max(maxX,p.x); minY=Math.min(minY,p.y); maxY=Math.max(maxY,p.y); }
  return {minX,maxX,minY,maxY};
}
export interface ContourAnalysis {
  closed:boolean; gaps:{after:string;before:string}[]; constantSegmentIds:string[];
  signedArea:Rational|null; bounds:Bounds|null;
}
export function analyzeContour(contour:Contour):ContourAnalysis {
  assertContour(contour);
  const points=new Map(contour.points.map(p=>[p.id,p])),paths=contour.segments.map(s=>controlsFor(s,points));
  const gaps:ContourAnalysis['gaps']=[],constantSegmentIds:string[]=[];
  let bounds:Bounds|null=null;
  contour.segments.forEach((segment,i)=>{
    const next=contour.segments[(i+1)%contour.segments.length]!;
    if(segment.endId!==next.startId) gaps.push({after:segment.id,before:next.id});
    if(isConstant(paths[i]!)) constantSegmentIds.push(segment.id);
    const b=controlBounds(paths[i]!);
    bounds=bounds?{minX:Math.min(bounds.minX,b.minX),maxX:Math.max(bounds.maxX,b.maxX),minY:Math.min(bounds.minY,b.minY),maxY:Math.max(bounds.maxY,b.maxY)}:b;
  });
  const closed=contour.segments.length>0&&gaps.length===0;
  // Algebraic area does not certify simplicity: crossings/contacts remain T032.
  return {closed,gaps,constantSegmentIds,signedArea:closed?pathIntegral(paths):null,bounds};
}
