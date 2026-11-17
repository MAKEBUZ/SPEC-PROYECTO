import { it,expect,vi,afterEach } from 'vitest';
import { CadTools } from '../../apps/desktop/src/renderer/cad/tools.js';
import { captureActiveDocument } from '../../apps/desktop/src/renderer/documents/recovery-capture.js';
afterEach(()=>vi.useRealTimers());
it('captures the current document across edits and stops on disposal',async()=>{
  vi.useFakeTimers();const tools=new CadTools(),request=vi.fn().mockResolvedValue({status:'success'}),notice=vi.fn();
  const stop=captureActiveDocument(tools,request,notice);await Promise.resolve();
  expect(request.mock.calls[0]![0].snapshot.pieces).toHaveLength(0);
  tools.draw([[0,0],[20,0]]);await vi.advanceTimersByTimeAsync(60000);
  expect(request.mock.calls[1]![0].snapshot.pieces).toHaveLength(1);
  expect(tools.dirty).toBe(true);stop();await vi.advanceTimersByTimeAsync(60000);expect(request).toHaveBeenCalledTimes(2);
});
it('recovers as unsaved and rejects a late replacement or dirty document',()=>{
  const tools=new CadTools(),candidate=new CadTools().document(),version=tools.getVersion();
  tools.recover(candidate,version);expect(tools.dirty).toBe(true);
  expect(()=>tools.recover(candidate,tools.getVersion())).toThrow();
  tools.create(true);const old=tools.getVersion();tools.create(true);
  expect(()=>tools.recover(candidate,old)).toThrow();
});
