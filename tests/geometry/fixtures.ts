// Analytical inputs only. IDs preserve explicit connectivity; coordinates are mm.
export type XY = readonly [number, number];
export type Curve = readonly [XY, XY] | readonly [XY, XY, XY, XY];
export interface Contour { points: { id: string; x: number; y: number }[]; segments: { id: string; kind: 'line'; startId: string; endId: string }[] }
const id = (n: number) => `00000000-0000-4000-8000-${n.toString().padStart(12,'0')}`;
export function polygon(vertices: readonly XY[], close = true): Contour {
  return { points: vertices.map(([x,y],i) => ({ id: id(i+1), x,y })), segments: vertices.slice(0, close ? vertices.length : -1).map((_,i) => ({ id: id(i+101), kind: 'line', startId: id(i+1), endId: id((i+1)%vertices.length+1) })) };
}
export const tiny = 2 ** -600;
export const constants: { name: string; curve: Curve; constant: boolean }[] = [
  { name: 'recta constante', curve: [[2,3],[2,3]], constant: true },
  { name: 'cúbica constante', curve: [[2,3],[2,3],[2,3],[2,3]], constant: true },
  { name: 'lazo cúbico no constante con extremos coincidentes', curve: [[0,0],[4,0],[0,4],[0,0]], constant: false },
  { name: 'cúbica colineal que recorre y vuelve', curve: [[0,0],[4,0],[-4,0],[0,0]], constant: false },
  { name: 'recta positiva menor que 0,1 mm', curve: [[0,0],[2**-40,0]], constant: false },
  { name: 'recta positiva cuyo cuadrado subdesborda double', curve: [[0,0],[tiny,0]], constant: false },
];
export const areas: { name: string; curves: Curve[]; numerator: bigint; denominator: bigint }[] = [
  { name: 'triángulo colineal, área nula', curves: [[[0,0],[2,0]],[[2,0],[4,0]],[[4,0],[0,0]]], numerator: 0n, denominator: 1n },
  { name: 'cuadrado positivo', curves: [[[0,0],[4,0]],[[4,0],[4,4]],[[4,4],[0,4]],[[0,4],[0,0]]], numerator: 16n, denominator: 1n },
  { name: 'área positiva de cúbica cerrada', curves: [[[0,0],[4,0],[0,4],[0,0]]], numerator: 12n, denominator: 5n },
  { name: 'área positiva pequeña', curves: [[[0,0],[2**-20,0]],[[2**-20,0],[0,2**-20]],[[0,2**-20],[0,0]]], numerator: 1n, denominator: 2n**41n },
  { name: 'área positiva inferior a Number.MIN_VALUE', curves: [[[0,0],[tiny,0]],[[tiny,0],[tiny,tiny]],[[tiny,tiny],[0,tiny]],[[0,tiny],[0,0]]], numerator: 1n, denominator: 2n**1200n },
  { name: 'autocruce con área algebraica no nula', curves: [[[0,0],[6,4]],[[6,4],[0,4]],[[0,4],[4,0]],[[4,0],[0,0]]], numerator: 4n, denominator: 1n },
];
export const parabola: Curve = [[-3,3],[-1,-1],[1,-1],[3,3]]; // (6t-3,12(t-1/2)^2)
export const pairs: { name: string; a: Curve; b: Curve; kind: 'none'|'crossing'|'contact'|'tangent'|'overlap'; witnesses: [number,number,XY][] }[] = [
  { name:'cruce interior recta/recta', a:[[0,0],[4,4]], b:[[0,4],[4,0]], kind:'crossing', witnesses:[[.5,.5,[2,2]]] },
  { name:'contacto extremo/interior', a:[[0,0],[4,0]], b:[[2,0],[2,3]], kind:'contact', witnesses:[[.5,0,[2,0]]] },
  { name:'solape parcial', a:[[0,0],[4,0]], b:[[2,0],[6,0]], kind:'overlap', witnesses:[[.5,0,[2,0]],[1,.5,[4,0]]] },
  { name:'solape invertido', a:[[0,0],[4,0]], b:[[4,0],[0,0]], kind:'overlap', witnesses:[[0,1,[0,0]],[1,0,[4,0]]] },
  { name:'tangencia interior doble sin cambio de signo', a:parabola, b:[[-3,0],[3,0]], kind:'tangent', witnesses:[[.5,.5,[0,0]]] },
  { name:'dos cruces con la misma cúbica', a:parabola, b:[[-3,.75],[3,.75]], kind:'crossing', witnesses:[[.25,.25,[-1.5,.75]],[.75,.75,[1.5,.75]]] },
  { name:'casi tangencia separada por 2^-40', a:parabola, b:[[-3,-(2**-40)],[3,-(2**-40)]], kind:'none', witnesses:[] },
  { name:'tangencia cúbica/cúbica', a:parabola, b:[[-3,-3],[-1,1],[1,1],[3,-3]], kind:'tangent', witnesses:[[.5,.5,[0,0]]] },
  { name:'coincidencia curva completa', a:parabola, b:parabola, kind:'overlap', witnesses:[[0,0,[-3,3]],[.5,.5,[0,0]],[1,1,[3,3]]] },
  { name:'coincidencia curva invertida', a:parabola, b:[...parabola].reverse() as unknown as Curve, kind:'overlap', witnesses:[[0,1,[-3,3]],[.5,.5,[0,0]],[1,0,[3,3]]] },
];
export const selfCrossing: Curve = [[18,-9],[-14,13],[-14,-13],[18,9]]; // B(1/4)=B(3/4)=(0,0), nonparallel tangents.
export const contours = [
  { name:'uniones consecutivas normales incluido cierre', contour:polygon([[0,0],[4,0],[4,4],[0,4]]), closed:true, defects:[] },
  { name:'mismo lugar, identidades sin unir', contour:polygon([[0,0],[4,0],[4,4],[0,4],[0,0]],false), closed:false, defects:['open'] },
  { name:'abertura inferior a tolerancia PDF', contour:polygon([[0,0],[4,0],[4,4],[0,2**-40]],false), closed:false, defects:['open'] },
  { name:'solape entre tramos consecutivos no se excluye', contour:polygon([[0,0],[4,0],[2,0],[2,2],[0,2]]), closed:true, defects:['overlap'] },
  { name:'contacto entre vértices no consecutivos', contour:polygon([[0,0],[4,0],[2,2],[4,4],[0,4],[2,2]]), closed:true, defects:['contact'] },
  { name:'autocruce de área algebraica positiva', contour:polygon([[0,0],[6,4],[0,4],[4,0]]), closed:true, defects:['crossing'] },
  { name:'rectángulo positivo sin umbral mínimo', contour:polygon([[0,0],[tiny,0],[tiny,tiny],[0,tiny]]), closed:true, defects:[] },
];
export const sizes = [
  { name:'5000 × 5000 inclusivo', width:5000,height:5000,validWidth:true,validHeight:true },
  { name:'solo ancho excedido', width:5000+2**-30,height:5000,validWidth:false,validHeight:true },
  { name:'solo alto excedido', width:5000,height:5000+2**-30,validWidth:true,validHeight:false },
  { name:'ambos ejes excedidos', width:5001,height:5001,validWidth:false,validHeight:false },
  // Can also represent a derived square exterior: base 4998 + 1 mm each side.
];
export const separations = [
  { name:'contacto', gap:0,valid:false },
  { name:'inferior a 2 mm', gap:2-2**-40,valid:false },
  { name:'exactamente 2 mm', gap:2,valid:true },
  { name:'superior a 2 mm', gap:2+2**-40,valid:true },
];
