'use client';
import {OperationLifecycle} from '../../../../packages/document/src/operations/lifecycle.js';
import {OperationJournal} from '../../../../packages/document/src/operations/journal.js';
import {WebHistoryStorage} from './history-storage.js';
import {WebJournalStorage} from './storage.js';
import {WebTimeStorage} from './time-storage.js';
let shared:OperationLifecycle|undefined;
let continuity:string;
export function webOperationLifecycle(){
 if(shared)return shared;
 const time=new WebTimeStorage(),stores=new Map<string,WebHistoryStorage>(),index=new WebHistoryStorage('00000000-0000-4000-8000-000000000000');continuity=crypto.randomUUID();
 return shared=new OperationLifecycle({admission:work=>navigator.locks.request('patron-operation-admission',work),load:()=>time.load(),save:s=>time.save(s),accounts:()=>index.accounts(),history:id=>{let s=stores.get(id);if(!s){s=new WebHistoryStorage(id);stores.set(id,s);}return s;},clock:()=>({continuity,now:performance.now()}),identifier:()=>crypto.randomUUID(),query:async(nonce,signal)=>{const r=await fetch('/v1/time?nonce='+encodeURIComponent(nonce),{signal,credentials:'omit',cache:'no-store',redirect:'error'});if(!r.ok)throw Error('TIME_UNAVAILABLE');return r.json();}},new OperationJournal(new WebJournalStorage()));
}
export function attachWebOperations(notify:(notice:string|null)=>void){
 const runtime=webOperationLifecycle();let disposed=false,hidden=false,acquiring=false,release:(()=>void)|undefined,timer:ReturnType<typeof setInterval>|undefined;
 const acquire=()=>{if(disposed||hidden||release||acquiring)return;acquiring=true;void navigator.locks.request('patron-operation-maintenance',{ifAvailable:true},async lock=>{if(!lock||disposed||hidden)return;await new Promise<void>(resolve=>{release=resolve;void runtime.start(navigator.onLine);timer=setInterval(()=>{void runtime.tick().then(()=>notify(runtime.notice));},1000);});release=undefined;}).catch(()=>notify('No se pudo abrir el mantenimiento local. Puede continuar trabajando.')).finally(()=>{acquiring=false;});};
 const stop=(reason:'close'|'suspend')=>{hidden=true;void runtime.interrupt(reason).finally(()=>{if(timer)clearInterval(timer);release?.();});};
 const hide=()=>stop('close'),freeze=()=>stop('suspend'),show=()=>{hidden=false;continuity=crypto.randomUUID();acquire();};
 const online=()=>{void runtime.connect(navigator.onLine);};
 window.addEventListener('pagehide',hide);window.addEventListener('pageshow',show);window.addEventListener('online',online);window.addEventListener('offline',online);document.addEventListener('freeze',freeze);document.addEventListener('resume',show);
 const retry=setInterval(acquire,2000);
 acquire();return ()=>{disposed=true;clearInterval(retry);hide();window.removeEventListener('pagehide',hide);window.removeEventListener('pageshow',show);window.removeEventListener('online',online);window.removeEventListener('offline',online);document.removeEventListener('freeze',freeze);document.removeEventListener('resume',show);};
}
