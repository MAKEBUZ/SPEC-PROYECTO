import { expect, it } from 'vitest';
import { assertContour, hasExplicitClosure } from '../../packages/geometry/src/model.js';
import { createPiece, assertPiece, withCornerDefaults, productionMetadataIssues } from '../../packages/document/src/piece.js';
import { validateDocument, parseDocument } from '../../packages/document/src/schema.js';
import { revisionId } from '../../packages/document/src/revision.js';
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const contour=()=>({points:[{id:id(1),x:0,y:0},{id:id(2),x:4,y:0},{id:id(3),x:0,y:0}],segments:[{id:id(4),kind:'line' as const,startId:id(1),endId:id(2)},{id:id(5),kind:'cubic' as const,startId:id(2),endId:id(3),handleStart:{x:4,y:3},handleEnd:{x:0,y:3}}]});
it('no confunde coordenadas coincidentes con cierre por identidad',()=>{
  const c=contour(); expect(hasExplicitClosure(c)).toBe(false); c.segments[1]!.endId=id(1); expect(hasExplicitClosure(c)).toBe(true);
  expect(hasExplicitClosure({points:[],segments:[]})).toBe(false);
});
it('valida referencias y finitud sin rechazar geometría de borrador',()=>{
  const c=contour(); expect(()=>assertContour(c)).not.toThrow();
  c.points[1]!.x=Number.MIN_VALUE; expect(()=>assertContour(c)).not.toThrow();
  c.segments[0]!.endId=id(9); expect(()=>assertContour(c)).toThrow();
});
it.each([NaN,Infinity,-Infinity])('rechaza coordenadas y tiradores no finitos %s',value=>{
  const c=contour(); c.points[0]!.x=value; expect(()=>assertContour(c)).toThrow();
  const d=contour(); d.segments[1]!.handleStart!.y=value; expect(()=>assertContour(d)).toThrow();
});
it('rechaza IDs repetidos entre puntos y segmentos y propiedades ajenas',()=>{
  const c=contour(); c.segments[0]!.id=id(1); expect(()=>assertContour(c)).toThrow();
  expect(()=>assertContour({...contour(),closed:true})).toThrow();
  const d=contour(); Object.assign(d.segments[0]!,{handleStart:{x:1,y:1}}); expect(()=>assertContour(d)).toThrow();
});
it('crea borrador con datos incompletos y esquinadas, sin modificar ni compartir la entrada',()=>{
  const c=contour(),before=structuredClone(c),p=createPiece(id(10),c);
  expect(c).toEqual(before); expect(p).toMatchObject({name:'',sizeLabel:'',cutQuantity:null,seamWidth:null,grainline:null,fold:false});
  expect(Object.values(p.cornerJoins)).toEqual(['miter','miter','miter']);
  p.contour.points[0]!.x=8; expect(c.points[0]!.x).toBe(0); expect(()=>assertPiece(p)).not.toThrow();
});
it('completa nuevas elecciones sin sustituir las existentes ni reparar al leer',()=>{
  const p=createPiece(id(10),contour()); p.cornerJoins={[id(1)]:'round'};
  const original=structuredClone(p); assertPiece(p); expect(p).toEqual(original);
  const next=withCornerDefaults(p); expect(next.cornerJoins).toEqual({[id(1)]:'round',[id(2)]:'miter',[id(3)]:'miter'}); expect(p).toEqual(original);
});
it('marca solo metadatos de producción incompletos; no bloquea el borrador',()=>{
  const p=createPiece(id(10)); expect(productionMetadataIssues(p)).toEqual(['name','sizeLabel','cutQuantity','grainline']);
  Object.assign(p,{name:'Delantero',sizeLabel:'M',cutQuantity:2,grainline:{start:{x:0,y:0},end:{x:0,y:1}},fold:false});
  expect(productionMetadataIssues(p)).toEqual([]);
  p.cutQuantity=.5; expect(productionMetadataIssues(p)).toEqual(['cutQuantity']); expect(()=>assertPiece(p)).not.toThrow();
});
it('rechaza margen negativo, uniones desconocidas y referencias ajenas sin modificar',()=>{
  const p=createPiece(id(10),contour()); p.seamWidth=-1; expect(()=>assertPiece(p)).toThrow(); p.seamWidth=0;
  expect(()=>assertPiece(p)).not.toThrow(); p.cornerJoins[id(99)]='round'; const before=structuredClone(p); expect(()=>withCornerDefaults(p)).toThrow(); expect(p).toEqual(before);
});
it('ida y vuelta y revisión conservan geometría, datos y esquinas mixtas',()=>{
  const p=createPiece(id(10),contour()); p.cornerJoins[id(1)]='round'; p.seamWidth=5;
  const d={formatVersion:1,documentId:id(20),revisionId:'0'.repeat(64),units:'mm',pieces:[p],preparations:[]};
  expect(parseDocument(JSON.stringify(d))).toEqual(d); expect(revisionId(parseDocument(JSON.stringify(d)))).toBe(revisionId(d));
  p.id=id(1); expect(()=>validateDocument(d)).toThrow();
});
