import {AsyncLocalStorage} from 'node:async_hooks';
/** One gate per composed API/database owner, shared by HTTP, transactions and
 * workers. No request may queue itself across a backup boundary. */
export class MaintenanceGate {
 private blocked=false;private active=0;private idle:(()=>void)|undefined;
 private readonly context=new AsyncLocalStorage<{active:boolean}>();
 get draining(){return this.blocked;}
 async run<T>(work:()=>Promise<T>):Promise<T>{
  if(this.blocked&&!this.context.getStore()?.active)throw Error('BACKUP_MAINTENANCE');
  this.active++;const token={active:true};
  try{return await this.context.run(token,work);}finally{token.active=false;this.active--;if(!this.active)this.idle?.();}
 }
 async drain(timeoutMs=60000){
  if(!Number.isSafeInteger(timeoutMs)||timeoutMs<=0)throw Error('BACKUP_DRAIN_TIMEOUT_INVALID');
  if(this.blocked)throw Error('BACKUP_ALREADY_RUNNING');this.blocked=true;
  if(this.active)try{await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('BACKUP_DRAIN_TIMEOUT')),timeoutMs);this.idle=()=>{clearTimeout(timer);resolve();};});}catch(e){this.idle=undefined;this.blocked=false;throw e;}
  this.idle=undefined;let released=false;
  return {release:async()=>{if(released)return;released=true;this.blocked=false;}};
 }
}
const owners=new WeakMap<object,MaintenanceGate>();
export function maintenanceFor(owner:object){let gate=owners.get(owner);if(!gate){gate=new MaintenanceGate();owners.set(owner,gate);}return gate;}
