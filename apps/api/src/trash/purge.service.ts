import {randomUUID,timingSafeEqual} from 'node:crypto';
import type {Pool} from 'pg';
import type {Credential} from '../http/access.js';
import type {HttpDto} from '../../../../packages/contracts/src/http-dto.js';
import {ValidationError,uuid} from '../../../../packages/contracts/src/validation.js';
import {SessionService} from '../auth/session.service.js';
import {inTransaction} from '../db/transaction.js';
import {requestDigest,runOperation,type RecordedResult} from '../operations/operation.service.js';
import {TrashService} from './trash.service.js';
import {ResourcePurgeMetadata} from './resource-purge.js';
import {PurgeWorker,type PurgeJob,type PurgeJournal} from './purge.worker.js';
type Session=Extract<Credential,{kind:'session'}>;
export class PurgeService {
 constructor(private readonly pool:Pool,private readonly sessions:SessionService,private readonly trash:TrashService,
  private readonly journal:PurgeJournal,private readonly key:Buffer,private readonly keyVersion:string){}
 request(s:Session,kind:'project'|'pattern',id:string,input:HttpDto<'PurgeResource'>){
  uuid(id);if(kind!=='project'&&kind!=='pattern'||input.confirmation!==true||input.acknowledgePermanentLoss!==true)throw new ValidationError('INVALID_INPUT');
  let externalIntent:string|undefined;
  return inTransaction(this.pool,async c=>{
   await this.sessions.authorizeFor(c,s,'normal');
   const digest=requestDigest({...input,kind,id},this.key,this.keyVersion);
   const old=(await c.query<{request_hash:string;state:RecordedResult['state'];outcome:RecordedResult['outcome'];data:unknown;confirmed_at:Date|null}>("SELECT * FROM operation_results WHERE requester_id=$1 AND operation_type='purge' AND operation_id=$2 FOR UPDATE",[s.accountId,input.operationId])).rows[0];
   if(old){const a=Buffer.from(old.request_hash),b=Buffer.from(digest);if(a.length!==b.length||!timingSafeEqual(a,b))throw new ValidationError('IDEMPOTENCY_CONFLICT');return old.state==='pending'?{operationId:input.operationId,state:'pending' as const}:{operationId:input.operationId,state:old.state,outcome:old.outcome,data:old.data,confirmedAt:old.confirmed_at?.toISOString()??null};}
   const capture=await this.trash.scopeIn(c,s,kind,id,'purge');
   if(capture.scopeRevision!==input.scopeRevision)throw new ValidationError('SCOPE_CHANGED');
   if(capture.blockers.length)throw new ValidationError('DEPENDENCIES_BLOCK');
   if(capture.root.state!=='trashed')throw new ValidationError('RESOURCE_UNAVAILABLE');
   const job:PurgeJob={id:randomUUID(),owner_id:s.accountId,operation_id:input.operationId,root_kind:kind,root_id:id,member_ids:kind==='project'?capture.children.map(p=>p.id):[id],object_keys:[],completed_keys:[],suppression_id:randomUUID(),state:'objects'};
   const metadata=new ResourcePurgeMetadata();job.object_keys=await metadata.keys(c,job);await metadata.validate(c,job);
   externalIntent=job.suppression_id;
   await this.journal.append({id:job.suppression_id,kind:'intent',scope:{kind,resourceIds:[...new Set([id,...job.member_ids])].sort(),objectKeys:[...job.object_keys].sort()}});
   // A failure here leaves an unresolved external intent, never authorization
   // to delete. Recovery tooling must reconcile it against this transaction.
   await this.sessions.authorizeFor(c,s,'normal');await metadata.validate(c,job);
   await metadata.seal(c,job);
   await c.query("INSERT INTO operation_results(requester_id,operation_type,operation_id,request_hash,state,historical_owner_id) VALUES($1,'purge',$2,$3,'pending',$1)",[s.accountId,input.operationId,digest]);
   await c.query("INSERT INTO purge_jobs(id,owner_id,operation_id,root_kind,root_id,scope_revision,member_ids,object_keys,state,suppression_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'objects',$9)",[job.id,s.accountId,input.operationId,kind,id,capture.scopeRevision,job.member_ids,job.object_keys,job.suppression_id]);
   await this.sessions.authorizeFor(c,s,'normal');
   return {operationId:input.operationId,state:'pending' as const};
  },()=>this.recordRollback(externalIntent)).catch(async error=>{
   // Persist a known rejection separately after rolling back the entire scope.
   // This is result evidence, not permission to perform a rejected deletion.
   if(!(error instanceof ValidationError))throw error;
   return inTransaction(this.pool,async c=>{
    if(!(await c.query('SELECT id FROM accounts WHERE id=$1 FOR UPDATE',[s.accountId])).rowCount)throw error;
    const result=await runOperation(c,{requesterId:s.accountId,operationType:'purge',operationId:input.operationId},requestDigest({...input,kind,id},this.key,this.keyVersion),async()=>({outcome:'failure',data:{code:error.code}}));
    await c.query("UPDATE operation_results SET historical_owner_id=$1 WHERE requester_id=$1 AND operation_type='purge' AND operation_id=$2",[s.accountId,input.operationId]);
    return result.state==='pending'?{operationId:input.operationId,state:'pending' as const}:{operationId:input.operationId,...result};
   });
  });
 }
 private async recordRollback(intentId:string|undefined){
  if(intentId&&(await this.journal.read()).some(r=>r.event.kind==='intent'&&r.event.id===intentId))await this.journal.append({id:randomUUID(),kind:'cancelled',intentId});
 }
 async queueExpired(){
  const batches=(await this.pool.query<{id:string;owner_id:string;root_kind:'project'|'pattern';root_id:string}>("SELECT id,owner_id,root_kind,root_id FROM trash_batches WHERE state='trashed' AND expires_at<=clock_timestamp() ORDER BY root_kind,expires_at,id")).rows;
  for(const batch of batches){
   let externalIntent:string|undefined;
   // One blocked project must not stop an independent expired pattern.
   await inTransaction(this.pool,async c=>{
    if(!(await c.query('SELECT id FROM accounts WHERE id=$1 FOR UPDATE',[batch.owner_id])).rowCount)return;
    if(!(await c.query("SELECT id FROM trash_batches WHERE id=$1 AND state='trashed' AND expires_at<=clock_timestamp() FOR UPDATE",[batch.id])).rowCount)return;
    const members=batch.root_kind==='pattern'?[batch.root_id]:(await c.query<{id:string}>('SELECT id FROM patterns WHERE project_id=$1 ORDER BY id FOR UPDATE',[batch.root_id])).rows.map(r=>r.id);
    const job:PurgeJob={id:randomUUID(),owner_id:batch.owner_id,operation_id:randomUUID(),root_kind:batch.root_kind,root_id:batch.root_id,member_ids:members,object_keys:[],completed_keys:[],suppression_id:randomUUID(),state:'objects'};
    const metadata=new ResourcePurgeMetadata();job.object_keys=await metadata.keys(c,job);await metadata.validate(c,job);
    externalIntent=job.suppression_id;
    await this.journal.append({id:job.suppression_id,kind:'intent',scope:{kind:job.root_kind,resourceIds:[...new Set([job.root_id,...members])].sort(),objectKeys:[...job.object_keys].sort()}});
    await metadata.validate(c,job);await metadata.seal(c,job);
    const digest=requestDigest({kind:'retention-expired',batchId:batch.id},this.key,this.keyVersion);
    await c.query("INSERT INTO operation_results(requester_id,operation_type,operation_id,request_hash,state,historical_owner_id) VALUES($1,'purge',$2,$3,'pending',$1)",[job.owner_id,job.operation_id,digest]);
    await c.query("INSERT INTO purge_jobs(id,owner_id,operation_id,root_kind,root_id,scope_revision,member_ids,object_keys,state,suppression_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'objects',$9)",[job.id,job.owner_id,job.operation_id,job.root_kind,job.root_id,digest,members,job.object_keys,job.suppression_id]);
   },()=>this.recordRollback(externalIntent)).catch(()=>undefined);
  }
 }
}
/** Bounded batches and per-job isolation: a failed object/journal does not stop
 * independent purges. Individual failures remain durably pending for retry. */
export class PurgeJobs {
 private stopped=false;
 private running:Promise<void>|undefined;private timer:ReturnType<typeof setInterval>|undefined;
 constructor(private readonly pool:Pool,private readonly worker:PurgeWorker,private readonly admission?:PurgeService){}
 run(){if(this.stopped)return this.running??Promise.resolve();if(this.running)return this.running;const next=(async()=>{
  await this.admission?.queueExpired();
  await this.worker.reconcile(['project','pattern']);
  let after='00000000-0000-0000-0000-000000000000';
  for(;;){
   const jobs=(await this.pool.query<{id:string}>("SELECT id FROM purge_jobs WHERE root_kind IN ('project','pattern') AND state<>'complete' AND id>$1 ORDER BY id LIMIT 100",[after])).rows;
   if(!jobs.length)break;
   for(const job of jobs)await this.worker.run(job.id).catch(()=>undefined);
   after=jobs.at(-1)!.id;
  }
 })();this.running=next;void next.finally(()=>{if(this.running===next)this.running=undefined;}).catch(()=>undefined);return next;}
 onModuleInit(){this.timer=setInterval(()=>{void this.run().catch(()=>undefined);},30000);this.timer.unref();void this.run().catch(()=>undefined);}
 async onModuleDestroy(){this.stopped=true;if(this.timer)clearInterval(this.timer);await this.running?.catch(()=>undefined);}
}
