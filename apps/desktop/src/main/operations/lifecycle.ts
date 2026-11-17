import {net,powerMonitor,type BrowserWindow} from 'electron';
import {readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {OperationLifecycle} from '../../../../../packages/document/src/operations/lifecycle.js';
import {OperationJournal} from '../../../../../packages/document/src/operations/journal.js';
import {DesktopHistoryStorage} from './history-storage.js';
import {DesktopJournalStorage} from './storage.js';
import {TimeCheckStorage} from './time-storage.js';

export function desktopOperationLifecycle(directory:string,origin?:string,cleanupRelated?:(accountId:string)=>Promise<void>){
 if(origin){const url=new URL(origin);if(url.protocol!=='https:'||url.origin!==origin)throw Error('INVALID_API_ORIGIN');}
 const histories=join(directory,'histories'),time=new TimeCheckStorage(join(directory,'time'));
 const stores=new Map<string,DesktopHistoryStorage>();let continuity=randomUUID();
 const runtime=new OperationLifecycle({cleanupRelated,load:()=>time.load(),save:s=>time.save(s),clock:()=>({continuity,now:performance.now()}),identifier:randomUUID,
  accounts:async()=>{try{return (await readdir(histories)).filter(n=>/^[a-f\d-]{36}$/i.test(n));}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return [];throw e;}},
  history:id=>{let store=stores.get(id);if(!store){store=new DesktopHistoryStorage(histories,id);stores.set(id,store);}return store;},
  query:async(nonce,signal)=>{if(!origin)throw Error('API_NOT_CONFIGURED');const r=await fetch(origin+'/v1/time?nonce='+encodeURIComponent(nonce),{signal,credentials:'omit',cache:'no-store',redirect:'error'});if(!r.ok)throw Error('TIME_UNAVAILABLE');return r.json();},
 },new OperationJournal(new DesktopJournalStorage(join(directory,'journal'))));
 return {runtime,attach(window:BrowserWindow){
  let online=!!origin&&net.isOnline();void runtime.start(online);
  const suspend=()=>{void runtime.interrupt('suspend');};
  // Electron does not prove cross-suspend clock continuity. Use the approved
  // uncertainty rule rather than substitute the user-adjustable civil clock.
  const resume=()=>{continuity=randomUUID();online=!!origin&&net.isOnline();void runtime.start(online);};
  powerMonitor.on('suspend',suspend);powerMonitor.on('resume',resume);
  const timer=setInterval(()=>{const next=!!origin&&net.isOnline();if(next!==online){online=next;void runtime.connect(next);}else void runtime.tick();},1000);timer.unref();
  const contents=window.webContents;
  const gone=()=>{void runtime.interrupt('suspend');};contents.on('render-process-gone',gone);
  const dispose=()=>{clearInterval(timer);powerMonitor.removeListener('suspend',suspend);powerMonitor.removeListener('resume',resume);contents.removeListener('render-process-gone',gone);void runtime.interrupt('close');};
  window.once('closed',dispose);return dispose;
 }};
}
