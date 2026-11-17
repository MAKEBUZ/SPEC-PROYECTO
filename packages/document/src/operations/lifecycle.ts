import {DTO,type HttpDto} from '../../../contracts/src/http-dto.js';
import {OperationJournal,journalHash} from './journal.js';
import {PENDING_WAITS} from './pending.js';
import {scopesConflict} from './scopes.js';
import {closeHistory,pendingDeletion,recoverHistory,receiveClosedResult,validateAccountHistory,type AccountHistory} from './closed.js';
import {HistoryMaintenance} from './maintenance.js';
import {TimeCheckCycle,type TimeCyclePorts} from './time-cycle.js';
import {RECOVERY_NOTICE} from './history-storage.js';
import {OperationsHistory,expireResolved,type HistoryPanelPorts} from './history-panel.js';

export interface HistoryStore {load():Promise<AccountHistory>;save(value:AccountHistory):Promise<void>}
export interface LifecyclePorts extends TimeCyclePorts {accounts():Promise<string[]>;history(accountId:string):HistoryStore;admission?<T>(work:()=>Promise<T>):Promise<T>;cleanupRelated?:((accountId:string)=>Promise<void>)|undefined}
/** One owner serializes event handling and cleanup. No account contents are
 * projected; the host exposes only a generic notice. Mutation transport stays
 * outside this class, and deletion requires a request already bound to history. */
export class OperationLifecycle {
 private readonly time:TimeCheckCycle;private ready=false;private opened=false;private online=false;
 private tail:Promise<unknown>=Promise.resolve();private maintenance=new Map<string,HistoryMaintenance>();
 private warning:string|null=null;private epoch=0;
 private confirmations=new Map<string,AccountHistory>();
 private panel:OperationsHistory|undefined;
 constructor(private readonly ports:LifecyclePorts,private readonly journal:OperationJournal){this.time=new TimeCheckCycle(ports);}
 get notice(){return this.warning;}
 get active(){return this.opened;}
 historyPanel(ports:Omit<HistoryPanelPorts,'allowed'|'clock'>){return this.panel??=new OperationsHistory(this.journal,{...ports,clock:()=>({...this.ports.clock(),receivedAt:Date.now()}),allowed:async accountId=>{try{return (await this.ports.history(accountId).load()).phase==='active';}catch(e){if(e instanceof Error&&e.message==='HISTORY_NOT_FOUND')return true;throw e;}}});}
 private serial<T>(work:()=>Promise<T>){const next=this.tail.catch(()=>undefined).then(work);this.tail=next;return next;}
 async start(online:boolean){this.opened=true;this.online=online;await this.tick();}
 interrupt(reason:'close'|'disconnect'|'suspend'){
  this.epoch++;if(reason==='disconnect')this.online=false;else this.opened=false;
  return this.time.interrupt(reason);
 }
 connect(online:boolean){if(!online)return this.interrupt('disconnect');this.online=true;return this.tick();}
 tick(){return this.serial(async()=>{
  if(!this.opened)return;
  if(this.online)void this.panel?.poll(()=>this.opened&&this.online).catch(()=>{});
  try{
   let warning:string|null=null,needsTime=false;
   for(const id of await this.journal.accounts())try{await expireResolved(this.journal,id,Date.now());}catch{warning??='No se pudo completar la limpieza local. Se reintentará automáticamente.';}
   const ids=await this.ports.accounts();
   for(const id of ids)try{
    const store=this.ports.history(id),history=validateAccountHistory(await store.load());
    if(history.phase!=='deleted'){
     const retained=[];for(const entry of history.entries){const current=await this.journal.record(id,entry.operationId);if(!current.exists||current.value!==null)retained.push(entry);}
     if(retained.length!==history.entries.length)await store.save({...history,entries:retained});
     continue;
    }
    if(history.retention!.state!=='expired'){
     if(!this.ready){await this.time.initialize();this.ready=true;}
     needsTime=true;await this.time.assess(history.retention!.latestDeadline??0);
    }
    let maintenance=this.maintenance.get(id);
    if(!maintenance){maintenance=new HistoryMaintenance(this.journal,{load:()=>store.load(),save:v=>store.save(v),clock:()=>this.ports.clock(),time:()=>this.ports.load(),cleanupRelated:this.ports.cleanupRelated});this.maintenance.set(id,maintenance);}
    if(history.retention!.state==='expired'||!this.time.storageBlocked)await maintenance.tick(this.opened);
    warning??=maintenance.notice;
   }catch(error){if(!(error instanceof Error)||error.message!=='HISTORY_NOT_FOUND')warning??=RECOVERY_NOTICE;}
   if(needsTime)await this.time.tick({open:this.opened,online:this.online});
   this.warning=warning??(this.time.storageBlocked?'No se pudo guardar la comprobación. Se reintentará automáticamente.':needsTime&&this.time.state.warning?'No se pudo comprobar el plazo. Se reintentará automáticamente.':null);
  }catch{this.warning=RECOVERY_NOTICE;}
 });}
 /** Called only after a validated successful issuance response, never from a
  * missing remote resource, HTTP failure or renderer-supplied deletion flag. */
 rememberDeletion(accountId:string,requestId:string){return this.serial(async()=>{
  const store=this.ports.history(accountId);let history:AccountHistory;
  try{history=await store.load();}catch(e){if(!(e instanceof Error)||e.message!=='HISTORY_NOT_FOUND')throw e;const state=await this.journal.inspect(accountId,true);if(state.damaged)throw Error('JOURNAL_DAMAGED');history={accountId,phase:'active',entries:state.entries};}
  if(history.phase!=='deleted'){const current=await this.journal.inspect(accountId,true);if(current.damaged)throw Error('JOURNAL_DAMAGED');history={...history,entries:current.entries};}
  await store.save(pendingDeletion(history,requestId));
 });}
 /** Bind to the epoch at request start, before awaiting transport. */
 capture(){return this.epoch;}
  async publicationBlocked(accountId:string,scopes:{kind:string;id:string}[]){const state=await this.journal.inspect(accountId,true);return state.damaged||state.entries.some(r=>r.state==='pending'&&scopesConflict(r.scopes,scopes));}
  async accountDeletionConfirmed(accountId:string){try{return (await this.ports.history(accountId).load()).phase==='deleted';}catch{return false;}}
  async publicationMayQuery(accountId:string,operationId:string){const r=await this.journal.record(accountId,operationId),v=r.value;if(!v||v.state==='resolved')return true;if(v.state!=='pending'||v.pause||['no_permission','unavailable'].includes(v.status))return false;const t=this.ports.clock();if(v.deadline!==null&&v.retryContinuity!==t.continuity){await this.journal.update(accountId,operationId,e=>e.state!=='pending'?e:{...e,deadline:t.now+PENDING_WAITS[Math.min(Math.max(0,e.retryLevel-1),PENDING_WAITS.length-1)]!,retryContinuity:t.continuity});return false;}return v.deadline===null||t.now>=v.deadline;}
  async publicationDeferred(accountId:string,operationId:string,code?:string){const r=await this.journal.record(accountId,operationId);if(r.value?.state!=='pending')return;const t=this.ports.clock();await this.journal.update(accountId,operationId,e=>e.state!=='pending'?e:{...e,status:code==='ACCESS_DENIED'?'no_permission':code==='OPERATION_RESULT_UNAVAILABLE'?'unavailable':'ready',retryLevel:Math.min(e.retryLevel+1,PENDING_WAITS.length),deadline:t.now+PENDING_WAITS[Math.min(e.retryLevel,PENDING_WAITS.length-1)]!,retryContinuity:t.continuity});}
  beginMutation(accountId:string,type:string,body:Record<string,unknown>,scopes:{kind:string;id:string}[]=[{kind:'account',id:accountId}]){const admit=async()=>{
  // Local correlation binds account/type/identity only. Do not create an
  // offline password oracle by persisting a fast hash of credential fields.
  // The server independently binds the full request with its secret HMAC.
  const requestHash=await journalHash(JSON.stringify({accountId,type,operationId:body.operationId}));
  const existing=await this.journal.record(accountId,body.operationId as string);
  if(!existing.exists&&!['logout','revokeAll'].includes(type)){
   const state=await this.journal.inspect(accountId,true);
   if(state.damaged||state.entries.some(r=>r.state==='pending'&&scopesConflict(r.scopes,scopes)))throw Error('OPERATION_PENDING');
  }
    const entry=await this.journal.ensure({accountId,operationId:body.operationId as string,type,requestHash,state:'pending',pause:false,retryLevel:0,deadline:null,status:'ready',scopes});
  if(!entry||entry.state==='closed')throw Error('OPERATION_ID_REUSED');
 };return this.serial(()=>this.ports.admission?this.ports.admission(admit):admit());}
 acceptOperation(accountId:string,type:string,value:unknown){return this.serial(async()=>{
  const result=DTO.MutationResult.parse(value);if(result.state!=='resolved')return;
  let history:AccountHistory|undefined;try{history=await this.ports.history(accountId).load();}catch(e){if(!(e instanceof Error)||e.message!=='HISTORY_NOT_FOUND')throw e;}
  if(history?.phase==='deleted'){
   if(this.confirmations.has(accountId)||this.time.storageBlocked)return;
   const entry=history.entries.find(e=>e.operationId===result.operationId&&e.type===type);if(!entry)return;
   const next=receiveClosedResult(history,{accountId,requestHash:entry.requestHash,result:{operationId:result.operationId,operationType:type,state:result.state,outcome:result.outcome,confirmedAt:result.confirmedAt,authorizedResourceRefs:[],actorLabel:''}},this.ports.clock(),await this.ports.load());
   await this.ports.history(accountId).save(next);return;
  }
  const state=await this.journal.inspect(accountId,true),entry=state.entries.find(e=>e.operationId===result.operationId&&e.type===type);
  if(!entry||entry.state!=='pending')return;
  await this.journal.update(accountId,result.operationId,e=>({...e,state:'resolved',outcome:result.outcome,confirmedAt:result.confirmedAt,receivedAt:Date.now()}));
 });}
 acceptDeletion(rows:unknown,epoch:number){return this.serial(async()=>{
  if(epoch!==this.epoch||!this.opened)return;
  if(!Array.isArray(rows))throw Error('DELETION_RESULT_INVALID');
  const proofs=rows.map(r=>DTO.DeletionStatus.parse(r));
  for(const id of await this.ports.accounts()){
   const store=this.ports.history(id);let history:AccountHistory;try{history=validateAccountHistory(await store.load());}catch(error){if(!(error instanceof Error)||error.message!=='HISTORY_NOT_FOUND')this.warning=RECOVERY_NOTICE;continue;}
   const proof:HttpDto<'DeletionStatus'>|undefined=proofs.find(p=>p.requestId===history.requestId);if(!proof||proof.state==='pending')continue;
   if(proof.state==='deleted'){
    const closed=this.confirmations.get(id)??closeHistory(history,proof,this.ports.clock(),await this.ports.load());
    this.confirmations.set(id,closed);await store.save(closed);this.confirmations.delete(id);
   }
   else if(history.phase==='deleting')await store.save(recoverHistory(history,proof));
  }
 });}
}

