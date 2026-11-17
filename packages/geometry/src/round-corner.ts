import type {Coordinate} from './model.js';

/** Circular fillet approximated by one tangent cubic, using the existing
 * editable Bézier representation. The radius is nominal, not an exact arc. */
export function roundCorner(a:Coordinate,b:Coordinate,c:Coordinate,radius:number){
  if(!Number.isFinite(radius)||radius<=0)throw new Error('Indica un radio mayor que 0 mm.');
  const l1=Math.hypot(b.x-a.x,b.y-a.y),l2=Math.hypot(c.x-b.x,c.y-b.y);
  const u={x:(b.x-a.x)/l1,y:(b.y-a.y)/l1},v={x:(c.x-b.x)/l2,y:(c.y-b.y)/l2};
  const angle=Math.abs(Math.atan2(u.x*v.y-u.y*v.x,u.x*v.x+u.y*v.y));
  if(!Number.isFinite(angle)||angle<1e-10||Math.PI-angle<1e-10)throw new Error('Esta esquina no permite un redondeado: revisa los tramos rectos y sus extremos.');
  const trim=radius*Math.tan(angle/2);
  if(!Number.isFinite(trim)||trim>=Math.min(l1,l2)*(1-8*Number.EPSILON))throw new Error('El radio no cabe en los tramos de esta esquina. Prueba un radio menor.');
  const start={x:b.x-u.x*trim,y:b.y-u.y*trim},end={x:b.x+v.x*trim,y:b.y+v.y*trim};
  // Derive handles directly from edge directions: no trig residue at cardinal
  // angles, tiny backwards excursions or unnecessary internal curve joins.
  const length=4/3*Math.tan(angle/4)*radius;
  const handleStart={x:start.x+u.x*length,y:start.y+u.y*length},handleEnd={x:end.x-v.x*length,y:end.y-v.y*length};
  if([start,end,handleStart,handleEnd].some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y))||
    (start.x===b.x&&start.y===b.y)||(end.x===b.x&&end.y===b.y)||(start.x===end.x&&start.y===end.y))
    throw new Error('El radio no se puede representar con precisión en estas coordenadas. Ajusta el radio o la pieza.');
  return {start,arcs:[{start,end,handleStart,handleEnd}]};
}
