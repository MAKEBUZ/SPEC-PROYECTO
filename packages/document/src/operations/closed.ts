import { DTO } from '../../../contracts/src/http-dto.js';
import { uuid } from '../../../contracts/src/validation.js';
import { OperationJournal,validateOperation,type LocalOperation } from './journal.js';
import { validateStoredTimeCheck,type ClockSample,type TimeCheckState } from './time-check.js';

export const CLOSED_RETENTION_MS=30*86400000;
export interface ClosedRetention {
 started:ClockSample;state:'valid'|'uncertain'|'expired';
 earliestDeadline?:number;latestDeadline?:number;
}
export interface AccountHistory {
 accountId:string;phase:'active'|'deleting'|'deleted';requestId?:string;
 entries:LocalOperation[];retention?:ClosedRetention;
}
function clock(value:ClockSample){if(!value.continuity||!Number.isFinite(value.now)||value.now<0)throw Error('INVALID_MONOTONIC_CLOCK');}
/** T060 persists these transitions before cleanup; T061 supplies only responses
 * bound to the original protected request credential and persisted time checks.
 * There is no transport, document-file access, civil clock or manual purge here.
 */
export function validateAccountHistory(input:AccountHistory):AccountHistory {
 uuid(input.accountId);if(!['active','deleting','deleted'].includes(input.phase)||!Array.isArray(input.entries))throw Error('HISTORY_DAMAGED');
 const seen=new Set<string>();for(const entry of input.entries){validateOperation(entry);if(entry.accountId!==input.accountId||seen.has(entry.operationId))throw Error('HISTORY_DAMAGED');if(entry.state==='closed'&&entry.outcome!==undefined&&(!['success','failure','no_change'].includes(entry.outcome)||!Number.isFinite(Date.parse(entry.confirmedAt!))))throw Error('HISTORY_DAMAGED');seen.add(entry.operationId);}
 if(input.phase!=='active')uuid(input.requestId);
 if(input.phase==='deleted'){
  const retention=input.retention;if(!retention)throw Error('HISTORY_DAMAGED');clock(retention.started);
  if(!['valid','uncertain','expired'].includes(retention.state)||input.entries.some(e=>e.state!=='closed'||e.closedAt!==retention.started.now))throw Error('HISTORY_DAMAGED');
  if(retention.earliestDeadline!==undefined||retention.latestDeadline!==undefined){if(!Number.isFinite(retention.earliestDeadline)||!Number.isFinite(retention.latestDeadline)||retention.earliestDeadline!>retention.latestDeadline!)throw Error('HISTORY_DAMAGED');}
 }else if(input.retention!==undefined||input.entries.some(e=>e.state==='closed'))throw Error('HISTORY_DAMAGED');
 return structuredClone(input);
}
export function historyView(input:AccountHistory,accountId:string|null,normalSessionValid:boolean){
 if(!normalSessionValid||input.phase!=='active'||accountId!==input.accountId)return [];
 return validateAccountHistory(input).entries;
}
export function pendingDeletion(input:AccountHistory,requestId:string){
 const history=validateAccountHistory(input);uuid(requestId);
 if(history.phase==='deleted'||history.phase==='deleting'&&history.requestId!==requestId)throw Error('HISTORY_TRANSITION_INVALID');
 return {...history,phase:'deleting' as const,requestId};
}
export function recoverHistory(input:AccountHistory,proof:unknown){
 const history=validateAccountHistory(input),response=DTO.DeletionStatus.parse(proof);
 if(history.phase!=='deleting'||response.requestId!==history.requestId||response.state!=='cancelled')throw Error('DELETION_NOT_CANCELLED');
 const {requestId:_,...active}=history;return {...active,phase:'active' as const};
}
export function closeHistory(input:AccountHistory,proof:unknown,received:ClockSample,time?:TimeCheckState){
 const history=validateAccountHistory(input),response=DTO.DeletionStatus.parse(proof);clock(received);
 if(response.state!=='deleted'||response.requestId!==history.requestId||history.phase==='active')throw Error('DELETION_NOT_CONFIRMED');
 if(history.phase==='deleted')return history; // Reception retries never extend retention.
 const entries=history.entries.filter(e=>e.state==='pending').map(e=>({...e,state:'closed' as const,closedAt:received.now,deadline:null}));
 return checkClosedRetention({...history,phase:'deleted',entries,retention:{started:{...received},state:'valid'}},received,time);
}
export function checkClosedRetention(input:AccountHistory,current:ClockSample,time?:TimeCheckState):AccountHistory {
 const history=validateAccountHistory(input);clock(current);if(history.phase!=='deleted')return history;
 const retention=history.retention!;if(retention.state==='expired')return history;
 let evidence:TimeCheckState['evidence'];
 if(time){const checked=validateStoredTimeCheck(time);if(checked.phase==='complete')evidence=checked.evidence;}
 if(evidence&&evidence.continuity===current.continuity&&current.now>=evidence.receivedMonotonic){
  if(retention.earliestDeadline===undefined&&evidence.continuity===retention.started.continuity){
   const adjustment=retention.started.now-evidence.receivedMonotonic+CLOSED_RETENTION_MS;
   retention.earliestDeadline=evidence.lower+adjustment;retention.latestDeadline=evidence.upper+adjustment;
  }
  if(retention.earliestDeadline!==undefined){
   const elapsed=current.now-evidence.receivedMonotonic;
   retention.state=evidence.lower+elapsed>=retention.latestDeadline!?'expired':evidence.upper+elapsed<retention.earliestDeadline?'valid':'uncertain';
  }else retention.state='uncertain';
 }else retention.state='uncertain';
 if(retention.state!=='expired'&&current.continuity===retention.started.continuity&&current.now>=retention.started.now)
  retention.state=current.now-retention.started.now>=CLOSED_RETENTION_MS?'expired':'valid';
 return history;
}
export function receiveClosedResult(input:AccountHistory,reply:{accountId:string;requestHash:string;result:unknown},current:ClockSample,time?:TimeCheckState){
 const history=checkClosedRetention(input,current,time);
 if(history.phase!=='deleted'||history.retention!.state!=='valid'||reply.accountId!==history.accountId)return history;
 let response:ReturnType<typeof DTO.OperationView.parse>;try{response=DTO.OperationView.parse(reply.result);}catch{return history;}
 if(response.state!=='resolved')return history;
 const entry=history.entries.find(e=>e.operationId===response.operationId&&e.type===response.operationType&&e.requestHash===reply.requestHash);
 if(!entry||entry.outcome!==undefined)return history;
 entry.outcome=response.outcome;entry.confirmedAt=response.confirmedAt;
 return history; // Remains closed and hidden, with the original retention anchor.
}
/** The caller must first durably record the account's deletion gate. Each
 * journal transition is verified separately, so retries resume partial work
 * without a multi-record transaction or a new retention start. Old storage
 * generations are physically compacted by T060, not by this transition. */
export async function applyDeletedHistory(journal:OperationJournal,input:AccountHistory){
 const history=validateAccountHistory(input);if(history.phase!=='deleted')throw Error('DELETION_NOT_CONFIRMED');
 const current=await journal.inspect(history.accountId,true);if(current.damaged)throw Error('JOURNAL_DAMAGED');
 const entries=new Map(history.entries.map(e=>[e.operationId,e]));
 for(const entry of current.entries){
  const updated=await journal.update(history.accountId,entry.operationId,r=>r.state==='resolved'?null:r.state==='pending'?{...r,state:'closed',closedAt:history.retention!.started.now,deadline:null}:r);
  if(updated)entries.set(updated.operationId,updated);else entries.delete(entry.operationId);
 }
 return {...history,entries:[...entries.values()]};
}
