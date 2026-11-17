import { it,expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { DocumentCommands } from '../../packages/document/src/commands.js';
import { createPiece } from '../../packages/document/src/piece.js';
import type { Preparation } from '../../packages/document/src/preparation.js';
import { parseDocument } from '../../packages/document/src/schema.js';
function editor(){const piece=createPiece(randomUUID()),document={formatVersion:1 as const,documentId:randomUUID(),revisionId:'0'.repeat(64),units:'mm' as const,pieces:[piece],preparations:[]};return {piece,commands:new DocumentCommands(document)};}
it('requires a unique trimmed name and a nonempty selection, with the approved defaults',()=>{
  const {piece,commands}=editor();commands.execute({type:'preparation.create',name:' Ensayo ',selection:[piece.id]});const p=commands.snapshot().preparations[0] as Preparation;
  expect(p).toMatchObject({name:'Ensayo',mode:'tiled',paper:'A4',margin:10,transforms:{[piece.id]:{x:0,y:0,rotation:0}}});
  for(const name of ['ENSAYO',' ensayo ',''])expect(()=>commands.execute({type:'preparation.create',name,selection:[piece.id]})).toThrow();expect(()=>commands.execute({type:'preparation.create',name:'Vacía',selection:[]})).toThrow();expect(commands.snapshot().preparations).toHaveLength(1);
});
it('moves/rotates only print placement, duplicates all settings, and cancelling creates nothing',()=>{
  const {piece,commands}=editor();commands.execute({type:'preparation.create',name:'Original',selection:[piece.id]});const id=commands.snapshot().preparations[0]!.id as string;
  commands.execute({type:'preparation.transform',id,pieceId:piece.id,transform:{x:120,y:-5,rotation:90}});commands.execute({type:'preparation.configure',id,mode:'large',paper:'Letter',margin:15});
  expect(commands.snapshot().pieces[0]).toEqual(piece);expect(commands.execute({type:'preparation.duplicate',id,name:null})).toBe(false);
  commands.execute({type:'preparation.duplicate',id,name:'Copia'});const [a,b]=commands.snapshot().preparations;expect({...b,id:a!.id,name:a!.name}).toEqual(a);expect(a!.id).not.toBe(b!.id);
});
it('preserves missing references and placement after editing or deleting a source piece',()=>{
  const {piece,commands}=editor();commands.execute({type:'preparation.create',name:'P',selection:[piece.id]});const before=commands.snapshot().preparations;
  commands.execute({type:'appendPoint',pieceId:piece.id,position:{x:1,y:2}});expect(commands.snapshot().preparations).toEqual(before);
  commands.execute({type:'deletePiece',pieceId:piece.id,confirmed:true});expect(commands.snapshot().preparations).toEqual(before);commands.undo();expect(commands.snapshot().pieces).toHaveLength(1);
});
it('confirms deletion and keeps undo only in the current document session',()=>{
  const {piece,commands}=editor();commands.execute({type:'preparation.create',name:'P',selection:[piece.id]});const id=commands.snapshot().preparations[0]!.id as string;commands.markSaved();
  expect(commands.execute({type:'preparation.delete',id,confirmed:false})).toBe(false);expect(commands.dirty).toBe(false);commands.execute({type:'preparation.delete',id,confirmed:true});expect(commands.dirty).toBe(true);commands.undo();expect(commands.snapshot().preparations).toHaveLength(1);commands.redo();expect(new DocumentCommands(commands.snapshot()).canUndo).toBe(false);
});
it('persists all named preparations and does not silently add newly created pieces',()=>{
  const {piece,commands}=editor();commands.execute({type:'preparation.create',name:'Primera',selection:[piece.id]});const id=commands.snapshot().preparations[0]!.id as string;
  commands.execute({type:'preparation.duplicate',id,name:'Segunda'});commands.execute({type:'addPiece',piece:createPiece(randomUUID())});
  expect(parseDocument(JSON.stringify(commands.snapshot())).preparations.map(p=>p.selection)).toEqual([[piece.id],[piece.id]]);
  expect(()=>commands.execute({type:'preparation.rename',id,name:' SEGUNDA '})).toThrow('PREPARATION_NAME_INVALID');
  expect(()=>commands.execute({type:'preparation.configure',id,mode:'tiled',paper:'A4',margin:-1})).toThrow();expect(()=>commands.execute({type:'preparation.select',id,selection:[]})).toThrow();
});
