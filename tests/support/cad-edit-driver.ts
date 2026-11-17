import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export interface EditorPoint { id: string; x: number; y: number }
export interface EditorPiece {
  id: string; name: string; sizeLabel: string; cutQuantity: number|null;
  contour: { points: EditorPoint[]; segments: { id: string; kind: 'line'|'cubic'; startId: string; endId: string; handleStart?: {x:number;y:number}; handleEnd?: {x:number;y:number} }[] };
  seamWidth: number|null; cornerJoins: Record<string,'round'|'miter'>;
  grainline: { start:{x:number;y:number}; end:{x:number;y:number} }|null; fold: boolean;
}
export interface EditorSnapshot { units:'mm'; pieces: EditorPiece[]; grid:number; snapGrid:boolean; snapEndpoints:boolean }
export interface CadEditDriver {
  // Binding must operate the real Electron renderer via Playwright. Snapshot is
  // read-only canonical document state, never a second implementation of editing.
  create(): Promise<void>;
  draw(vertices: readonly (readonly [number,number])[], kinds?: readonly ('line'|'cubic')[]): Promise<string>;
  select(pieceId:string): Promise<void>;
  point(index:number,x:number,y:number): Promise<void>;
  shiftPoint(index:number,dx:number,dy:number): Promise<void>;
  addPoint(after:number,x:number,y:number): Promise<void>;
  removePoint(index:number): Promise<void>;
  handle(segment:number,end:'start'|'end',x:number,y:number): Promise<void>;
  closeContour(): Promise<void>;
  grid(spacing:number,snapGrid:boolean,snapEndpoints:boolean): Promise<void>;
  dragPoint(index:number,x:number,y:number): Promise<void>;
  move(dx:number,dy:number): Promise<void>;
  rotate(degrees:number,cx:number,cy:number): Promise<void>;
  reflect(axisStart:readonly[number,number],axisEnd:readonly[number,number]): Promise<void>;
  duplicate(): Promise<string>;
  deletePiece(confirm:boolean): Promise<void>;
  margin(width:number|null): Promise<void>;
  corner(pointId:string,join:'round'|'miter'): Promise<void>;
  properties(value:Pick<EditorPiece,'name'|'sizeLabel'|'cutQuantity'|'grainline'|'fold'>): Promise<void>;
  view(unit:'mm'|'cm',zoom:number): Promise<void>;
  undo(): Promise<void>; redo(): Promise<void>;
  snapshot(): Promise<EditorSnapshot>;
  close(): Promise<void>;
}
export async function openCadEditor(): Promise<CadEditDriver> {
  const file=resolve('tests/support/cad-edit-binding.ts');
  if (!existsSync(file)) throw new Error('CAD_EDITOR_NOT_IMPLEMENTED: T035–T037 deben conectar el renderer real; T028 no simula operaciones de edición.');
  const binding=await import(/* @vite-ignore */ pathToFileURL(file).href) as { openCadEditor():Promise<CadEditDriver> };
  return binding.openCadEditor();
}
