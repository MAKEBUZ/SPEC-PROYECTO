import { describe,it,expect } from 'vitest';
import { DocumentCommands } from '../../packages/document/src/commands.js';
import { createPiece } from '../../packages/document/src/piece.js';
import { polygon } from '../geometry/fixtures.js';
import type { PatternDocument } from '../../packages/document/src/schema.js';
const id='80000000-0000-4000-8000-000000000001';
function setup(){
  const p=createPiece(id,polygon([[0,0],[40,0],[40,30],[0,30]],false));
  p.grainline={start:{x:10,y:5},end:{x:10,y:25}};
  const d:PatternDocument={formatVersion:1,documentId:'80000000-0000-4000-8000-000000000002',revisionId:'0'.repeat(64),units:'mm',pieces:[p],preparations:[]};
  return new DocumentCommands(d);
}
describe('T035 reversible document commands',()=>{
  it('restores exact snapshots, dirty state and abandons redo only on a new edit',()=>{
    const h=setup(),before=h.snapshot();h.execute({type:'move',pieceId:id,dx:12.5,dy:-7.25});const after=h.snapshot();
    expect(h.dirty).toBe(true);expect(h.undo()).toBe(true);expect(h.snapshot()).toEqual(before);expect(h.dirty).toBe(false);
    h.execute({type:'deletePiece',pieceId:id,confirmed:false});expect(h.canRedo).toBe(true);
    h.redo();expect(h.snapshot()).toEqual(after);h.markSaved();expect(h.dirty).toBe(false);
    h.undo();expect(h.dirty).toBe(true);h.execute({type:'move',pieceId:id,dx:0,dy:5});expect(h.redo()).toBe(false);
  });
  it('rolls back failures without damaging redo or exposing mutable snapshots',()=>{
    const h=setup();h.execute({type:'move',pieceId:id,dx:1,dy:0});h.undo();const before=h.snapshot();
    expect(()=>h.execute({type:'margin',pieceId:id,width:-1})).toThrow();expect(h.snapshot()).toEqual(before);expect(h.canRedo).toBe(true);
    before.pieces[0]!.name='external';expect(h.snapshot().pieces[0]!.name).toBe('');
  });
  it('moves handles and grainline with the piece and undoes without inverse arithmetic',()=>{
    const h=setup(),p=h.snapshot().pieces[0]!,s=p.contour.segments[0]!;
    h.execute({type:'segment',pieceId:id,segment:{...s,kind:'cubic',handleStart:{x:10,y:-5},handleEnd:{x:30,y:-5}}});
    const before=h.snapshot();h.execute({type:'move',pieceId:id,dx:3,dy:7});
    expect(h.snapshot().pieces[0]!.grainline!.start).toEqual({x:13,y:12});
    expect(h.snapshot().pieces[0]!.contour.segments[0]).toMatchObject({handleStart:{x:13,y:2}});
    h.undo();expect(h.snapshot()).toEqual(before);
  });
  it('rotates and reflects about the chosen origin and axis',()=>{
    const h=setup();h.execute({type:'rotate',pieceId:id,degrees:90,center:{x:0,y:0}});
    expect(h.snapshot().pieces[0]!.contour.points[2]).toMatchObject({x:-30,y:40});h.undo();
    h.execute({type:'rotate',pieceId:id,degrees:-90,center:{x:0,y:0}});expect(h.snapshot().pieces[0]!.contour.points[2]).toMatchObject({x:30,y:-40});h.undo();
    h.execute({type:'rotate',pieceId:id,degrees:1e-20,center:{x:0,y:0}});expect(h.snapshot().pieces[0]!.contour.points[1]!.y).toBeGreaterThan(0);h.undo();
    h.execute({type:'reflect',pieceId:id,start:{x:10,y:-50},end:{x:10,y:50}});
    expect(h.snapshot().pieces[0]!.contour.points[1]).toMatchObject({x:-20,y:0});
    expect(()=>h.execute({type:'reflect',pieceId:id,start:{x:0,y:0},end:{x:0,y:0}})).toThrow();
  });
  it('duplicates every identity independently and reuses them on redo',()=>{
    const h=setup();h.execute({type:'duplicate',pieceId:id});const after=h.snapshot(),a=after.pieces[0]!,b=after.pieces[1]!;
    const ids=new Set([a.id,...a.contour.points.map(p=>p.id),...a.contour.segments.map(s=>s.id)]);
    for(const key of [b.id,...b.contour.points.map(p=>p.id),...b.contour.segments.map(s=>s.id)])expect(ids.has(key)).toBe(false);
    expect(Object.keys(b.cornerJoins)).toEqual(b.contour.points.map(p=>p.id));h.undo();h.redo();expect(h.snapshot()).toEqual(after);
    h.execute({type:'move',pieceId:b.id,dx:100,dy:0});expect(h.snapshot().pieces[0]).toEqual(a);
  });
  it('requires destructive confirmation and preserves missing preparation references',()=>{
    const document=setup().snapshot();document.preparations=[{id:'80000000-0000-4000-8000-000000000003',name:'Imprimir',selection:[id],transforms:{[id]:{x:0,y:0,rotation:0}},mode:'large',paper:'A4',margin:10}];
    const h=new DocumentCommands(document),before=h.snapshot();h.execute({type:'deletePiece',pieceId:id,confirmed:false});expect(h.snapshot()).toEqual(before);
    h.execute({type:'deletePiece',pieceId:id,confirmed:true});expect(h.snapshot().pieces).toEqual([]);h.undo();expect(h.snapshot()).toEqual(before);
    h.redo();expect(h.snapshot().preparations).toEqual(before.preparations);
  });
  it('closes explicitly and preserves invalid draft geometry',()=>{
    const h=setup();h.execute({type:'close',pieceId:id});const p=h.snapshot().pieces[0]!;
    expect(p.contour.segments.at(-1)!.endId).toBe(p.contour.points[0]!.id);h.undo();expect(h.snapshot().pieces[0]!.contour.segments).toHaveLength(3);
    h.execute({type:'point',pieceId:id,pointId:p.contour.points[1]!.id,position:{x:0,y:0}});expect(h.snapshot().pieces[0]!.contour.points[1]!.x).toBe(0);
  });
  it('edits points, handles, margin, corners and marks reversibly without moving unrelated data',()=>{
    const h=setup(),p=h.snapshot().pieces[0]!,before=p.contour;
    h.execute({type:'margin',pieceId:id,width:6000});h.execute({type:'corner',pieceId:id,pointId:p.contour.points[0]!.id,join:'round'});
    h.execute({type:'properties',pieceId:id,properties:{name:'Delantero',sizeLabel:'M',cutQuantity:2,fold:true,grainline:p.grainline}});
    expect(h.snapshot().pieces[0]!.contour).toEqual(before);h.undo();h.undo();h.undo();expect(h.snapshot().pieces[0]).toEqual(p);
  });
  it('inserts points by subdivision and removes only incident segments after confirmation',()=>{
    const h=setup(),before=h.snapshot(),s=before.pieces[0]!.contour.segments[0]!;
    h.execute({type:'insertPoint',pieceId:id,segmentId:s.id,t:.5});const p=h.snapshot().pieces[0]!;
    expect(p.contour.points).toHaveLength(5);const added=p.contour.points.find(p=>!before.pieces[0]!.contour.points.some(v=>v.id===p.id))!;
    expect(added).toMatchObject({x:20,y:0});h.execute({type:'removePoint',pieceId:id,pointId:added.id,confirmed:true});
    expect(h.snapshot().pieces[0]!.contour.points).toHaveLength(4);h.undo();expect(h.snapshot().pieces[0]).toEqual(p);h.undo();expect(h.snapshot()).toEqual(before);
  });
  it('rejects nonfinite and overflowing transforms atomically',()=>{
    const h=setup(),before=h.snapshot();expect(()=>h.execute({type:'move',pieceId:id,dx:Infinity,dy:0})).toThrow();
    expect(h.snapshot()).toEqual(before);expect(h.canUndo).toBe(false);
    expect(()=>h.execute({type:'move',pieceId:id,dx:1e300,dy:0})).toThrow('TRANSFORM_PRECISION_LOSS');expect(h.snapshot()).toEqual(before);
  });
  it('preserves curve shape when splitting a cubic, and replays the same IDs',()=>{
    const h=setup(),s=h.snapshot().pieces[0]!.contour.segments[0]!;
    h.execute({type:'segment',pieceId:id,segment:{...s,kind:'cubic',handleStart:{x:0,y:40},handleEnd:{x:40,y:40}}});
    h.execute({type:'insertPoint',pieceId:id,segmentId:s.id,t:.5});const after=h.snapshot(),p=after.pieces[0]!;
    expect(p.contour.points[1]).toMatchObject({x:20,y:30});
    expect(p.contour.segments[0]).toMatchObject({handleStart:{x:0,y:20},handleEnd:{x:10,y:30}});
    expect(p.contour.segments[1]).toMatchObject({handleStart:{x:30,y:30},handleEnd:{x:40,y:20}});
    h.undo();h.redo();expect(h.snapshot()).toEqual(after);
  });
  it('creates geometry, edits handles and coordinates without implicit snapping',()=>{
    const h=setup(),piece=createPiece('80000000-0000-4000-8000-000000000004');h.execute({type:'addPiece',piece});piece.name='outside';
    h.execute({type:'appendPoint',pieceId:piece.id,position:{x:1.25,y:2.5}});h.execute({type:'appendPoint',pieceId:piece.id,position:{x:5,y:6}});
    const points=h.snapshot().pieces[1]!.contour.points,segmentId='80000000-0000-4000-8000-000000000005';
    h.execute({type:'segment',pieceId:piece.id,segment:{id:segmentId,kind:'cubic',startId:points[0]!.id,endId:points[1]!.id,handleStart:{x:2,y:2},handleEnd:{x:4,y:4}}});
    h.execute({type:'handle',pieceId:piece.id,segmentId,end:'end',position:{x:4.25,y:5.75}});
    h.execute({type:'shiftPoint',pieceId:piece.id,pointId:points[0]!.id,dx:.25,dy:-.5});
    const p=h.snapshot().pieces[1]!;expect(p.name).toBe('');expect(p.contour.points[0]).toMatchObject({x:1.5,y:2});expect(p.contour.segments[0]).toMatchObject({handleEnd:{x:4.25,y:5.75}});
  });
  it('rejects ID collisions and stale entities without recording an action',()=>{
    const h=new DocumentCommands(setup().snapshot(),()=>id),before=h.snapshot();
    expect(()=>h.execute({type:'duplicate',pieceId:id})).toThrow('IDENTITY_COLLISION');
    expect(()=>h.execute({type:'point',pieceId:id,pointId:'missing',position:{x:0,y:0}})).toThrow('ENTITY_NOT_FOUND');
    expect(h.snapshot()).toEqual(before);expect(h.canUndo).toBe(false);
  });
  it('merges coincident endpoints only on explicit close and can restore their identities',()=>{
    const h=setup(),p=h.snapshot().pieces[0]!;
    h.execute({type:'point',pieceId:id,pointId:p.contour.points.at(-1)!.id,position:{x:0,y:0}});const before=h.snapshot();
    h.execute({type:'close',pieceId:id});expect(h.snapshot().pieces[0]!.contour.points).toHaveLength(3);h.undo();expect(h.snapshot()).toEqual(before);
  });
  it('keeps edits made during save dirty and does not undo the saved revision header',()=>{
    const h=setup(),saved=h.snapshot();saved.revisionId='a'.repeat(64);h.execute({type:'move',pieceId:id,dx:1,dy:1});
    h.markSaved(saved);expect(h.dirty).toBe(true);h.undo();expect(h.dirty).toBe(false);expect(h.snapshot().revisionId).toBe(saved.revisionId);
  });
  it('preserves pairwise distances at arbitrary rotation and oblique reflection',()=>{
    const h=setup(),before=h.snapshot().pieces[0]!,distance=(p:typeof before)=>p.contour.points.flatMap((a,i)=>p.contour.points.slice(i+1).map(b=>Math.hypot(a.x-b.x,a.y-b.y)));
    h.execute({type:'rotate',pieceId:id,degrees:37,center:{x:10,y:20}});
    distance(h.snapshot().pieces[0]!).forEach((v,i)=>expect(v).toBeCloseTo(distance(before)[i]!,10));h.undo();
    h.execute({type:'reflect',pieceId:id,start:{x:2,y:3},end:{x:7,y:9}});
    distance(h.snapshot().pieces[0]!).forEach((v,i)=>expect(v).toBeCloseTo(distance(before)[i]!,10));h.undo();expect(h.snapshot().pieces[0]).toEqual(before);
  });
});
