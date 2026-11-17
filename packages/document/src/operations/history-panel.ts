import {OperationJournal,journalHash,type LocalOperation} from './journal.js';
import {PendingQueries} from './pending.js';
import {parsePending} from '../../../contracts/src/account-actions.js';
import {uuid} from '../../../contracts/src/validation.js';
export const RESOLVED_RETENTION_MS=30*86400000;
export interface HistoryAuth {accountId:string|null;sessionId:string|null;valid:boolean;online:boolean}
export interface HistoryRow {operationId:string;type:string;state:'pending'|'resolved';status:LocalOperation['status'];pause:boolean;outcome?:LocalOperation['outcome'];receivedAt?:number}
export interface HistoryView {visible:boolean;accountId?:string;sessionId?:string;online?:boolean;pending:HistoryRow[];resolved:HistoryRow[];damaged:boolean;cleanupFailed?:boolean;settledLegacyIds:string[]}
export interface HistoryPanelPorts {auth():Promise<HistoryAuth>;allowed(accountId:string):Promise<boolean>;clock():{now:number;continuity:string;receivedAt:number};query(operation:Readonly<LocalOperation>):Promise<unknown>}
const hidden=():HistoryView=>({visible:false,pending:[],resolved:[],damaged:false,settledLegacyIds:[]});
export async function expireResolved(journal:OperationJournal,accountId:string,now:number){
 if(!Number.isFinite(now))throw Error('INVALID_CLOCK');
 for(const entry of (await journal.inspect(accountId,true)).entries)if(entry.state==='resolved'&&now-entry.receivedAt!>=RESOLVED_RETENTION_MS){
  await journal.update(accountId,entry.operationId,r=>r.state==='resolved'&&now-r.receivedAt!>=RESOLVED_RETENTION_MS?null:r);
  await journal.compact(accountId,entry.operationId);
 }
 for(const id of await journal.removedIds(accountId))await journal.compact(accountId,id);
}
/** Auth is read again after awaits and before actions. Only a projection is
 * returned; local storage keys, scopes and request hashes stay in the host. */
export class OperationsHistory {
 private queries:PendingQueries;
 private polling:Promise<void>|undefined;
 private scopes=new Map<string,{accountId:string;sessionId:string;ids:string[]}>();
 constructor(private readonly journal:OperationJournal,private readonly ports:HistoryPanelPorts){this.queries=new PendingQueries(journal,{query:op=>ports.query(op)});}
 poll(open:()=>boolean=()=>true):Promise<void>{if(this.polling)return this.polling;this.polling=Promise.resolve().then(async()=>{const a=await this.authorized();if(!a?.online||!open())return;for(const entry of (await this.journal.inspect(a.accountId,true)).entries){if(!open())return;if(entry.state!=='pending'||entry.pause||['no_permission','unavailable'].includes(entry.status))continue;await this.same(a);if(!open())return;await this.check(entry.operationId,false);}}).finally(()=>{this.polling=undefined;});return this.polling;}
 private async authorized(){const a=await this.ports.auth();return a.valid&&a.accountId&&a.sessionId&&await this.ports.allowed(a.accountId)?a:null;}
 private async same(a:HistoryAuth){const b=await this.authorized();if(!b||b.accountId!==a.accountId||b.sessionId!==a.sessionId)throw Error('SESSION_REQUIRED');return b;}
 async view(legacy:unknown=[]):Promise<HistoryView>{
  const a=await this.authorized();if(!a)return hidden();
  const settledLegacyIds:string[]=[];
  for(const old of parsePending(legacy).filter(p=>p.accountId===a.accountId)){
   await this.same(a);const existing=await this.journal.record(a.accountId!,old.operationId);
   if(existing.exists){if(!existing.value||existing.value.state==='resolved')settledLegacyIds.push(old.operationId);continue;}
   const ensured=await this.journal.ensure({accountId:a.accountId!,operationId:old.operationId,type:old.operationType,requestHash:await journalHash(JSON.stringify({accountId:a.accountId,type:old.operationType,operationId:old.operationId})),state:'pending',pause:false,retryLevel:0,deadline:null,status:'ready',scopes:[{kind:'account',id:a.accountId!}]});if(!ensured||ensured.state==='resolved')settledLegacyIds.push(old.operationId);
  }
  let cleanupFailed=false;try{await expireResolved(this.journal,a.accountId!,this.ports.clock().receivedAt);}catch{cleanupFailed=true;}
  const state=await this.journal.inspect(a.accountId,true);
  try{await this.same(a);}catch{return hidden();}
  const rows=state.entries.filter(e=>e.state!=='closed'&&(e.state!=='resolved'||this.ports.clock().receivedAt-e.receivedAt!<RESOLVED_RETENTION_MS)).map(e=>({operationId:e.operationId,type:e.type,state:e.state as 'pending'|'resolved',status:e.status,pause:e.pause,...(e.outcome?{outcome:e.outcome}:{}),...(e.receivedAt!==undefined?{receivedAt:e.receivedAt}:{})}));
  return {visible:true,accountId:a.accountId!,sessionId:a.sessionId!,online:a.online,pending:rows.filter(r=>r.state==='pending'),resolved:rows.filter(r=>r.state==='resolved'),damaged:state.damaged,cleanupFailed,settledLegacyIds};
 }
 async check(id:string,manual=true){uuid(id);const a=await this.authorized();if(!a||!a.online)throw Error('SESSION_REQUIRED');const time=this.ports.clock();if(!(await this.same(a)).online)throw Error('SESSION_REQUIRED');await this.queries.check(id,{accountId:a.accountId,sessionValid:true,online:a.online,...time,currentTime:()=>this.ports.clock()},manual);}
 async pause(id:string,paused:boolean){uuid(id);if(typeof paused!=='boolean')throw Error('INVALID_INPUT');const a=await this.authorized();if(!a)throw Error('SESSION_REQUIRED');await this.same(a);await this.queries.pause(a.accountId!,id,paused);}
 async prepareClear(ids:string[]){if(!Array.isArray(ids)||!ids.length)throw Error('EMPTY_SCOPE');ids.forEach(uuid);const a=await this.authorized();if(!a)throw Error('SESSION_REQUIRED');const view=await this.view();await this.same(a);const selected=[...new Set(ids)];if(selected.some(id=>!view.resolved.some(r=>r.operationId===id)))throw Error('SCOPE_CHANGED');const scopeId=crypto.randomUUID();this.scopes.set(scopeId,{accountId:a.accountId!,sessionId:a.sessionId!,ids:selected});return {scopeId,count:selected.length};}
 async cancelClear(scopeId:string){uuid(scopeId);this.scopes.delete(scopeId);}
 async confirmClear(scopeId:string){uuid(scopeId);const scope=this.scopes.get(scopeId);this.scopes.delete(scopeId);if(!scope)throw Error('SCOPE_CHANGED');const a=await this.authorized();if(!a||a.accountId!==scope.accountId||a.sessionId!==scope.sessionId)throw Error('SESSION_REQUIRED');for(const id of scope.ids){await this.same(a);const entry=await this.journal.record(scope.accountId,id);if(entry.value?.state==='resolved'){await this.journal.update(scope.accountId,id,r=>r.state==='resolved'?null:r);await this.journal.compact(scope.accountId,id);}}}
 async retry(id:string){uuid(id);const a=await this.authorized();if(!a||!a.online)throw Error('SESSION_REQUIRED');const view=await this.view(),row=view.resolved.find(e=>e.operationId===id&&e.outcome==='failure');if(!(await this.same(a)).online)throw Error('SESSION_REQUIRED');if(!row)throw Error('RETRY_UNAVAILABLE');return {accountId:a.accountId!,operationId:id,type:row.type};}
 async dispatch(value:unknown){
  if(!value||typeof value!=='object')throw Error('INVALID_INPUT');const v=value as Record<string,unknown>;
  switch(v.kind){case 'view':return this.view(v.legacy??[]);case 'check':await this.check(v.id as string,v.manual!==false);return null;case 'pause':await this.pause(v.id as string,v.paused as boolean);return null;case 'prepareClear':return this.prepareClear(v.ids as string[]);case 'confirmClear':await this.confirmClear(v.scopeId as string);return null;case 'cancelClear':await this.cancelClear(v.scopeId as string);return null;case 'retry':return this.retry(v.id as string);default:throw Error('INVALID_INPUT');}
 }
}
