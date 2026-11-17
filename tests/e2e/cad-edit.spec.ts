import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { openCadEditor } from '../support/cad-edit-driver.js';
import type { CadEditDriver, EditorPiece } from '../support/cad-edit-driver.js';

let cad: CadEditDriver|undefined, pieceId:string;
// Real Electron interactions span multiple rendering/actionability waits.
// This bounds each UI scenario, not the numerical or production performance goals.
vi.setConfig({testTimeout:30000});
const vertices = [[0,0],[40,0],[40,30],[0,30]] as const;
const editor=() => { if (!cad) throw new Error('Editor no iniciado'); return cad; };
async function piece(id=pieceId):Promise<EditorPiece> { const value=(await editor().snapshot()).pieces.find(p=>p.id===id); expect(value).toBeDefined(); return value!; }
const positions=(p:EditorPiece)=>p.contour.points.map(({x,y})=>[x,y]);
const distances=(p:EditorPiece)=>p.contour.points.flatMap((a,i)=>p.contour.points.slice(i+1).map(b=>(a.x-b.x)**2+(a.y-b.y)**2));
async function reversible(action:()=>Promise<void>) {
  const before=await editor().snapshot(); await action(); const after=await editor().snapshot(); expect(after.pieces).not.toEqual(before.pieces);
  await editor().undo(); expect((await editor().snapshot()).pieces).toEqual(before.pieces);
  await editor().redo(); expect((await editor().snapshot()).pieces).toEqual(after.pieces);
}
beforeEach(async () => { cad=await openCadEditor(); await cad.create(); pieceId=await cad.draw(vertices); await cad.select(pieceId); });
afterEach(async () => { await cad?.close(); cad=undefined; });

it('FR-005/035: rectas por puntos y cierre explícito por identidad', async () => {
  expect(positions(await piece())).toEqual(vertices.map(p=>[...p]));
  const before=await piece(); expect(before.contour.segments).toHaveLength(3);
  await reversible(()=>editor().closeContour());
  const closed=await piece(); expect(closed.contour.segments.at(-1)!.endId).toBe(closed.contour.segments[0]!.startId);
});
it('FR-005/007: crear contorno mixto y ajustar tiradores', async () => {
  pieceId=await editor().draw([[100,0],[140,0],[140,30]],['cubic','line']); await editor().select(pieceId);
  const before=await piece(); expect(before.contour.segments.map(s=>s.kind)).toEqual(['cubic','line']);
  await reversible(async()=>{ await editor().handle(0,'start',110,-10); });
  expect((await piece()).contour.segments[0]!.handleStart).toEqual({x:110,y:-10});
  await reversible(()=>editor().handle(0,'end',130,10));
  expect((await piece()).contour.segments[0]!.handleEnd).toEqual({x:130,y:10});
  expect(positions(await piece())).toEqual(positions(before));
});
it('FR-005/007: añadir y eliminar puntos con undo/redo', async () => {
  await reversible(()=>editor().addPoint(0,20,0)); expect((await piece()).contour.points).toHaveLength(5);
  await reversible(()=>editor().removePoint(1)); expect((await piece()).contour.points).toHaveLength(4);
});
it('FR-025: coordenadas explícitas no se redondean aun con snapping activo', async () => {
  await editor().grid(10,true,true); await reversible(()=>editor().point(1,12.25,3.75));
  expect(positions(await piece())[1]).toEqual([12.25,3.75]);
  await reversible(()=>editor().shiftPoint(1,-.25,2.5)); expect(positions(await piece())[1]).toEqual([12,6.25]);
});
it('FR-025: configurar cuadrícula y snapping no modifica geometría', async () => {
  const before=await piece(); await editor().grid(7.5,true,false); expect(await piece()).toEqual(before);
  await editor().grid(5,false,true); expect(await piece()).toEqual(before);
  expect(await editor().snapshot()).toMatchObject({grid:5,snapGrid:false,snapEndpoints:true});
});
it('FR-025: arrastre ajusta a cuadrícula solo cuando está activado', async () => {
  await editor().grid(10,true,false); await editor().dragPoint(1,19.9,10.1); expect(positions(await piece())[1]).toEqual([20,10]);
  await editor().grid(10,false,false); await editor().dragPoint(1,19.9,10.1);
  const point=(await piece()).contour.points[1]!; expect(point.x).toBeCloseTo(19.9,8); expect(point.y).toBeCloseTo(10.1,8);
});
it('FR-025/035: ajuste a extremo une identidades mediante acción explícita', async () => {
  await editor().grid(10,false,true); await editor().dragPoint(3,0,0); await editor().closeContour();
  const p=await piece(); expect(p.contour.segments.at(-1)!.endId).toBe(p.contour.segments[0]!.startId);
});
it.each([0,-1,NaN,Infinity])('FR-025: cuadrícula inválida %s conserva estado', async spacing => {
  const before=await editor().snapshot(); await expect(editor().grid(spacing,true,true)).rejects.toThrow(); expect(await editor().snapshot()).toEqual(before);
});
it.each([NaN,Infinity,-Infinity])('FR-005/025: coordenada no finita %s no altera documento', async value => {
  const before=await piece(); await expect(editor().point(1,value,0)).rejects.toThrow(); expect(await piece()).toEqual(before);
});
it('FR-006: unidad y zoom cambian solo la presentación', async () => {
  const before=await piece(); await editor().view('cm',3); expect(await piece()).toEqual(before); expect((await editor().snapshot()).units).toBe('mm');
  await editor().view('mm',.25); expect(await piece()).toEqual(before);
});
it('FR-023/007: mover conserva dimensiones y admite undo/redo', async () => {
  const before=await piece(); await reversible(()=>editor().move(12.5,-7.25));
  expect(positions(await piece())).toEqual(positions(before).map(([x,y])=>[x!+12.5,y!-7.25])); expect(distances(await piece())).toEqual(distances(before));
});
it('FR-023/007: rotar 90 grados respecto del origen conserva dimensiones', async () => {
  const before=await piece(); await reversible(()=>editor().rotate(90,0,0));
  positions(await piece()).forEach(([x,y],i)=>{ expect(x).toBeCloseTo(-before.contour.points[i]!.y,10); expect(y).toBeCloseTo(before.contour.points[i]!.x,10); });
  distances(await piece()).forEach((d,i)=>expect(d).toBeCloseTo(distances(before)[i]!,8));
});
it('FR-023/007: reflejar respecto del eje elegido x=10', async () => {
  const before=await piece(); await reversible(()=>editor().reflect([10,-50],[10,50]));
  expect(positions(await piece())).toEqual(positions(before).map(([x,y])=>[20-x!,y])); expect(distances(await piece())).toEqual(distances(before));
});
it('FR-023: duplicado independiente con identidades nuevas', async () => {
  const original=await piece(); let copyId=''; await reversible(async()=>{ copyId=await editor().duplicate(); }); expect(copyId).not.toBe(pieceId);
  const copy=await piece(copyId); expect(positions(copy)).toEqual(positions(original));
  const originalIds=new Set([original.id,...original.contour.points.map(p=>p.id),...original.contour.segments.map(s=>s.id)]);
  for (const id of [copy.id,...copy.contour.points.map(p=>p.id),...copy.contour.segments.map(s=>s.id)]) expect(originalIds.has(id)).toBe(false);
  await editor().select(copyId); await editor().move(100,0); expect(await piece(pieceId)).toEqual(original);
});
it('FR-017/023: cancelar eliminación conserva pieza; confirmar permite deshacer', async () => {
  const before=await editor().snapshot(); await editor().deletePiece(false); expect(await editor().snapshot()).toEqual(before);
  await reversible(()=>editor().deletePiece(true)); expect((await editor().snapshot()).pieces.some(p=>p.id===pieceId)).toBe(false);
});
it('FR-024: aplicar, editar y quitar margen sin modificar contorno base', async () => {
  await editor().closeContour(); const base=(await piece()).contour;
  for (const width of [10,0,null]) { await reversible(()=>editor().margin(width)); expect((await piece()).seamWidth).toBe(width); expect((await piece()).contour).toEqual(base); }
});
it.each([-1,NaN,Infinity])('FR-024: margen inválido %s conserva estado previo', async width => {
  await editor().closeContour(); await editor().margin(10); const before=await piece();
  await expect(editor().margin(width)).rejects.toThrow(); expect(await piece()).toEqual(before);
});
it('FR-024: esquinas esquinadas por defecto y combinación individual reversible', async () => {
  await editor().closeContour(); await editor().margin(5); const before=await piece();
  for (const point of before.contour.points) expect(before.cornerJoins[point.id]).toBe('miter');
  const id=before.contour.points[0]!.id; await reversible(()=>editor().corner(id,'round'));
  expect((await piece()).cornerJoins).toEqual({...before.cornerJoins,[id]:'round'}); expect((await piece()).contour).toEqual(before.contour);
  await editor().margin(7); expect((await piece()).cornerJoins[id]).toBe('round');
});
it('FR-026/007: datos, hilo y doblez separados del contorno y reversibles', async () => {
  const before=await piece(), properties={name:'Delantero',sizeLabel:'M',cutQuantity:2,grainline:{start:{x:10,y:5},end:{x:10,y:25}},fold:true};
  await reversible(()=>editor().properties(properties)); expect(await piece()).toMatchObject(properties); expect((await piece()).contour).toEqual(before.contour);
});
it('FR-007: nueva edición tras deshacer no reaplica una rama abandonada', async () => {
  await editor().move(10,0); await editor().undo(); await editor().move(0,5); const before=await piece();
  await editor().redo(); expect(await piece()).toEqual(before);
});
