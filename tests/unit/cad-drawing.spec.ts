import {it,expect} from 'vitest';
import {CadTools} from '../../apps/desktop/src/renderer/cad/tools.js';
it('adds each point and its segment as one reversible command, including curves',()=>{
 const t=new CadTools();t.draw([[10,20]]);t.extend(100,20);const two=t.document();t.extend(100,120,'cubic');
 expect(t.piece().contour.points).toHaveLength(3);expect(t.piece().contour.segments[1]?.kind).toBe('cubic');
 t.undo();expect(t.document()).toEqual(two);t.redo();expect(t.piece().contour.points).toHaveLength(3);
 t.closeContour();const closed=t.document();expect(()=>t.extend(3,4)).toThrow('CONTOUR_ALREADY_CLOSED');expect(t.document()).toEqual(closed);
});
it('curves a segment reversibly and snaps clicked points without modifying the view',()=>{
 const t=new CadTools();t.configureGrid(10,true,false);t.draw([[0,0]]);t.extend(49,2);expect(t.piece().contour.points[1]).toMatchObject({x:50,y:0});
 const before=t.document();t.curve(0);const s=t.piece().contour.segments[0]!;expect(s.kind).toBe('cubic');if(s.kind==='cubic')expect(s.handleStart.y).toBeGreaterThan(0);
 t.undo();expect(t.document()).toEqual(before);
});
it('closes with the requested curved segment and restores the open contour on undo',()=>{
 const t=new CadTools();t.draw([[0,0],[100,0],[100,100]]);const before=t.document();t.closeContour('cubic');
 const c=t.piece().contour;expect(c.segments.at(-1)?.kind).toBe('cubic');expect(c.segments.at(-1)?.endId).toBe(c.points[0]?.id);
 t.undo();expect(t.document()).toEqual(before);
});
