import { DTO } from '../../../contracts/src/http-dto.js';
import { OperationJournal } from './journal.js';
import type { LocalOperation } from './journal.js';
import {scopesConflict} from './scopes.js';
export const PENDING_WAITS=[1000,2000,5000,10000,30000,60000] as const;
const waits=PENDING_WAITS;
export interface PendingContext {accountId:string|null;sessionValid:boolean;online:boolean;continuity:string;now:number;receivedAt:number;currentTime?:()=>{now:number;receivedAt:number;continuity:string}}
export interface QueryPort {query(operation:Readonly<LocalOperation>):Promise<unknown>}
/** Polls only: this component has no mutation/replay transport. */
export class PendingQueries {
  private readonly inflight=new Set<string>();
  constructor(private readonly journal:OperationJournal,private readonly port:QueryPort){}
  async pause(accountId:string,id:string,paused:boolean){return this.journal.update(accountId,id,r=>{if(r.state!=='pending')throw new Error('OPERATION_ALREADY_RESOLVED');return {...r,pause:paused};});}
  async blocked(accountId:string,scopes:LocalOperation['scopes']){
    const state=await this.journal.inspect(accountId,true);if(state.damaged)return true;
    return state.entries.some(r=>r.state==='pending'&&scopesConflict(r.scopes,scopes));
  }
  async check(id:string,context:PendingContext,manual=false){
    if(!context.accountId||!context.sessionValid||!context.online)return;
    const accountId=context.accountId,key=`${accountId}:${id}`;if(this.inflight.has(key))return;
    this.inflight.add(key);
    try{
      const operation=(await this.journal.inspect(accountId,true)).entries.find(r=>r.operationId===id);
      if(!operation||operation.state!=='pending')return;
      if(!manual){
        if(operation.pause||['no_permission','unavailable'].includes(operation.status))return;
        if(operation.deadline!==null&&operation.retryContinuity!==context.continuity){await this.journal.update(accountId,id,r=>({...r,deadline:context.now+waits[Math.min(Math.max(0,r.retryLevel-1),waits.length-1)]!,retryContinuity:context.continuity}));return;}
        if(operation.deadline!==null&&context.now<operation.deadline)return;
      }
      let result:ReturnType<typeof DTO.OperationView.parse>;
      try{result=DTO.OperationView.parse(await this.port.query(structuredClone(operation)));if(result.operationId!==id||result.operationType!==operation.type)throw new Error('OPERATION_RESULT_MISMATCH');}
      catch(error){const time=context.currentTime?.()??context;const code=error&&typeof error==='object'&&'code'in error?error.code:undefined;await this.journal.update(accountId,id,r=>r.state!=='pending'?r:{...r,status:code==='ACCESS_DENIED'?'no_permission':code==='OPERATION_RESULT_UNAVAILABLE'?'unavailable':'ready',retryLevel:Math.min(r.retryLevel+1,waits.length),deadline:time.now+waits[Math.min(r.retryLevel,waits.length-1)]!,retryContinuity:time.continuity});return;}
      const time=context.currentTime?.()??context;
      await this.journal.update(accountId,id,r=>{
        if(r.state!=='pending')return r; // Never revive closed or resolved history.
        return result.state==='resolved'?{...r,state:'resolved',status:'ready',outcome:result.outcome,confirmedAt:result.confirmedAt,receivedAt:time.receivedAt,deadline:null}:{...r,status:'ready',retryLevel:Math.min(r.retryLevel+1,waits.length),deadline:time.now+waits[Math.min(r.retryLevel,waits.length-1)]!,retryContinuity:time.continuity};
      });
    }finally{this.inflight.delete(key);}
  }
}
