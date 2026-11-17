import type { HttpDto } from '../../contracts/src/http-dto.js';
import type { AccountClient } from './client.js';
import { DeletionCheckController } from './deletion-check-controller.js';
export interface DeletionWatchState {rows:HttpDto<'DeletionStatus'>[];failed:boolean}
type Listener=(state:DeletionWatchState)=>void;
interface Watch {listeners:Set<Listener>;state:DeletionWatchState;controller:DeletionCheckController;dispose():void}
const watches=new WeakMap<AccountClient,Watch>();
/** A root subscription keeps checks alive while the account screen is unmounted.
 * Subscribers receive only limited status, never credentials or account content. */
export function watchDeletionChecks(client:AccountClient,listener:Listener){
  let watch=watches.get(client);
  if(!watch){
    const listeners=new Set<Listener>();
    const notify=(state:DeletionWatchState)=>{watch!.state=state;for(const fn of listeners)fn(structuredClone(state));};
    const controller=new DeletionCheckController({query:()=>client.query('checks'),result:rows=>notify({rows,failed:false}),failure:()=>notify({rows:watch!.state.rows,failed:true})});
    const connect=()=>controller.connect(navigator.onLine),hide=()=>controller.stop(),show=()=>controller.start(navigator.onLine);
    watch={listeners,state:{rows:[],failed:false},controller,dispose:()=>{
      controller.stop();window.removeEventListener('online',connect);window.removeEventListener('offline',connect);
      window.removeEventListener('pagehide',hide);window.removeEventListener('pageshow',show);
    }};
    watches.set(client,watch);
    window.addEventListener('online',connect);window.addEventListener('offline',connect);
    window.addEventListener('pagehide',hide);window.addEventListener('pageshow',show);
    controller.start(navigator.onLine);
  }
  watch.listeners.add(listener);listener(structuredClone(watch.state));
  const current=watch;
  let disposed=false;
  return {checkNow:()=>current.controller.checkNow(),dispose:()=>{
    if(disposed)return;disposed=true;
    current.listeners.delete(listener);
    if(!current.listeners.size){current.dispose();watches.delete(client);}
  }};
}
