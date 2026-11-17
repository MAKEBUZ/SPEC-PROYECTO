import {it,expect,vi,afterEach} from 'vitest';
import {EventEmitter} from 'node:events';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
const electron=vi.hoisted(()=>({online:true,power:undefined as unknown as import('node:events').EventEmitter}));
vi.mock('electron',async()=>{const {EventEmitter}=await import('node:events');electron.power=new EventEmitter();return {net:{isOnline:()=>electron.online},powerMonitor:electron.power};});
import {desktopOperationLifecycle} from '../../apps/desktop/src/main/operations/lifecycle.js';
afterEach(()=>vi.useRealTimers());
it('T061 wires desktop suspend/resume, network and renderer interruption and detaches after close',async()=>{
 vi.useFakeTimers();const root=await mkdtemp(join(tmpdir(),'patron-lifecycle-'));try{
  const host=desktopOperationLifecycle(root,'https://example.invalid'),start=vi.spyOn(host.runtime,'start').mockResolvedValue(),interrupt=vi.spyOn(host.runtime,'interrupt').mockResolvedValue(),connect=vi.spyOn(host.runtime,'connect').mockResolvedValue(),tick=vi.spyOn(host.runtime,'tick').mockResolvedValue();
  const window=Object.assign(new EventEmitter(),{webContents:new EventEmitter()});host.attach(window as unknown as import('electron').BrowserWindow);
  expect(start).toHaveBeenCalledWith(true);electron.power.emit('suspend');expect(interrupt).toHaveBeenLastCalledWith('suspend');electron.power.emit('resume');expect(start).toHaveBeenCalledTimes(2);
  electron.online=false;await vi.advanceTimersByTimeAsync(1000);expect(connect).toHaveBeenCalledWith(false);
  window.webContents.emit('render-process-gone');expect(interrupt).toHaveBeenLastCalledWith('suspend');window.emit('closed');expect(interrupt).toHaveBeenLastCalledWith('close');
  const before=tick.mock.calls.length;await vi.advanceTimersByTimeAsync(3000);electron.power.emit('resume');expect(start).toHaveBeenCalledTimes(2);expect(tick.mock.calls).toHaveLength(before);
 }finally{electron.online=true;await rm(root,{recursive:true,force:true});}
});
