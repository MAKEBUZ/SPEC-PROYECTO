import { it,expect } from 'vitest';
import { CadTools } from '../../apps/desktop/src/renderer/cad/tools.js';
it('keeps presentation independent from millimetres and snaps only pointer input',()=>{
  const c=new CadTools();c.draw([[0,0],[40,0],[40,30]]);const before=c.document();
  c.configureGrid(10,true,false);c.view('cm',2);expect(c.document()).toEqual(before);
  c.point(1,12.25,3.75);expect(c.piece().contour.points[1]).toMatchObject({x:12.25,y:3.75});
  c.dragPoint(1,19.9,10.1);expect(c.piece().contour.points[1]).toMatchObject({x:20,y:10});
  expect(()=>c.configureGrid(0,true,true)).toThrow();expect(c.grid.spacing).toBe(10);
});
it('supports actual editing commands and revision notifications',()=>{
  const c=new CadTools();let changes=0;const stop=c.subscribe(()=>changes++);const id=c.draw([[0,0],[40,0],[40,30]],['cubic','line']);
  c.handle(0,'start',10,-10);expect(c.piece().contour.segments[0]).toMatchObject({handleStart:{x:10,y:-10}});
  c.closeContour();c.undo();expect(c.piece().contour.segments).toHaveLength(2);c.redo();
  const copy=c.duplicate();expect(copy).not.toBe(id);c.select(id);expect(c.piece().id).toBe(id);expect(changes).toBeGreaterThan(4);stop();
});
