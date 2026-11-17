import {validateAccountHistory,type AccountHistory} from './closed.js';
import {journalHash} from './journal.js';

export const RECOVERY_NOTICE='No se pudo recuperar un registro local. Permanece aislado; puede continuar trabajando.';
export interface HistorySnapshot {digest:string;primary:string;backup:string}
export async function encodeHistory(input:AccountHistory):Promise<HistorySnapshot>{
 const primary=JSON.stringify(validateAccountHistory(input));return {primary,backup:primary,digest:await journalHash(primary)};
}
/** Never chooses an older generation. The independent digest binds both copies
 * to the exact latest state, including expiry and already removed entries. */
export async function decodeHistory(input:HistorySnapshot,accountId:string):Promise<AccountHistory>{
 if(!/^[a-f0-9]{64}$/.test(input.digest))throw Error('HISTORY_RECOVERY_UNAVAILABLE');
 for(const copy of [input.primary,input.backup])try{
  if(typeof copy!=='string'||await journalHash(copy)!==input.digest)continue;
  const state=validateAccountHistory(JSON.parse(copy));if(state.accountId!==accountId)continue;return state;
 }catch{/* The other exact copy may still be intact. */}
 throw Error('HISTORY_RECOVERY_UNAVAILABLE');
}
export function assertHistoryProgress(previous:AccountHistory|undefined,next:AccountHistory){
 if(!previous)return;
 if(previous.accountId!==next.accountId)throw Error('HISTORY_ROLLBACK');
 if(previous.phase!=='deleted')return;
 if(next.phase!=='deleted'||previous.requestId!==next.requestId||JSON.stringify(previous.retention!.started)!==JSON.stringify(next.retention!.started)||previous.retention!.state==='expired'&&next.retention!.state!=='expired')throw Error('HISTORY_ROLLBACK');
 if(previous.retention!.earliestDeadline!==undefined&&(next.retention!.earliestDeadline!==previous.retention!.earliestDeadline||next.retention!.latestDeadline!==previous.retention!.latestDeadline))throw Error('HISTORY_ROLLBACK');
 const old=new Map(previous.entries.map(e=>[e.operationId,e]));
 for(const entry of next.entries){const before=old.get(entry.operationId);if(!before||before.requestHash!==entry.requestHash||before.type!==entry.type||before.outcome!==undefined&&(entry.outcome!==before.outcome||entry.confirmedAt!==before.confirmedAt))throw Error('HISTORY_ROLLBACK');}
}
