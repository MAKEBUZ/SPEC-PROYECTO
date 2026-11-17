import {maintenanceFor} from '../storage/maintenance-gate.js';
import { createHash } from 'node:crypto';
import type { Pool,PoolClient } from 'pg';
import type { BlobStore } from '../storage/blob-store.js';
import type { SuppressionEvent,SuppressionScope,SuppressionRecord } from '../storage/suppression-log.js';
import { canonicalize } from '../../../../packages/document/src/revision.js';
import { uuid } from '../../../../packages/contracts/src/validation.js';

export interface PurgeJob {
  id:string;owner_id:string;operation_id:string;root_kind:'project'|'pattern'|'account';root_id:string;
  member_ids:string[];object_keys:string[];completed_keys:string[];suppression_id:string;
  state:'intent'|'objects'|'metadata'|'complete';
}
export interface PurgeJournal {append(event:SuppressionEvent):Promise<unknown>;read():Promise<SuppressionRecord[]>}
export interface PurgeMetadata {
  /** Check the captured scope under the account lock; reject any drift. */
  validate(client:PoolClient,job:PurgeJob):Promise<void>;
  /** Make the authorized scope non-recoverable, in the same transaction as objects state. */
  seal(client:PoolClient,job:PurgeJob):Promise<void>;
  /** Remove metadata and release quota atomically, only after all blobs were removed. */
  remove(client:PoolClient,job:PurgeJob):Promise<void>;
  /** Resolve the original operation only after the journal confirms suppression. */
  finish(client:PoolClient,job:PurgeJob):Promise<void>;
}
// Deterministic event identity survives a crash between append and DB commit.
export function purgeConfirmationId(intentId:string){
  uuid(intentId);const h=createHash('sha256').update(`purge-confirmed:${intentId}`).digest('hex');
  return `${h.slice(0,8)}-${h.slice(8,12)}-5${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`;
}
function scope(job:PurgeJob):SuppressionScope {
  return {kind:job.root_kind,resourceIds:[...new Set([job.root_id,...job.member_ids])].sort(),objectKeys:[...job.object_keys].sort()};
}
/** Consumes internally authorized, immutable jobs, never raw HTTP input. The
 * intent stage is recoverable staging: no object is removed until the external
 * journal and non-recoverable DB transition both succeed. A failed transaction
 * can leave an unresolved journal intent; it deliberately blocks backup restore
 * until reconciled, rather than inventing an outcome. */
export class PurgeWorker {
  constructor(private readonly pool:Pool,private readonly blobs:Pick<BlobStore,'remove'>,
    private readonly journal:PurgeJournal,private readonly metadata:PurgeMetadata){}
  /** Reconcile external intents against positive job evidence only. A missing
   * job (especially in a restored DB) proves neither rollback nor completion. */
  reconcile(kinds:readonly PurgeJob['root_kind'][]){return maintenanceFor(this.pool).run(async()=>{
    const records=await this.journal.read(),results:{intentId:string;state:'complete'|'cancelled'|'blocked'|'busy'}[]=[];
    for(const r of records){
      const e=r.event;if(e.kind!=='intent'||!kinds.includes(e.scope.kind))continue;
      const matches=(await this.pool.query<PurgeJob>('SELECT * FROM purge_jobs WHERE suppression_id=$1',[e.id])).rows;
      if(records.some(c=>c.event.kind==='cancelled'&&c.event.intentId===e.id)){results.push({intentId:e.id,state:matches.length?'blocked':'cancelled'});continue;}
      const job=matches[0],confirmed=records.some(c=>c.event.kind==='confirmed'&&c.event.intentId===e.id);
      if(matches.length!==1||!job||canonicalize(scope(job))!==canonicalize(e.scope)||job.state==='complete'&&!confirmed){results.push({intentId:e.id,state:'blocked'});continue;}
      try{results.push({intentId:e.id,state:await this.run(job.id)});}catch{results.push({intentId:e.id,state:'blocked'});}
    }
    return results;
  });}
  run(id:string):Promise<'busy'|'complete'> {return maintenanceFor(this.pool).run(()=>this.runAdmitted(id));}
  private async runAdmitted(id:string):Promise<'busy'|'complete'> {
    uuid(id);const client=await this.pool.connect();let locked=false,transaction=false;
    try{
      locked=(await client.query<{locked:boolean}>('SELECT pg_try_advisory_lock(172903,hashtext($1)) AS locked',[id])).rows[0]!.locked;
      if(!locked)return 'busy';
      const transact=async<T>(action:()=>Promise<T>)=>{
        await client.query('BEGIN');transaction=true;
        const value=await action();await client.query('COMMIT');transaction=false;return value;
      };
      const read=async()=>{
        const row=(await client.query<PurgeJob>('SELECT * FROM purge_jobs WHERE id=$1',[id])).rows[0];
        if(!row)throw Error('PURGE_JOB_MISSING');
        if(new Set(row.object_keys).size!==row.object_keys.length||row.object_keys.some(k=>!/^[a-f0-9]{64}$/.test(k))||row.completed_keys.some(k=>!row.object_keys.includes(k)))throw Error('PURGE_JOB_INVALID');
        return row;
      };
      let job=await read();if(job.state==='complete')return 'complete';
      if((await this.journal.read()).some(r=>r.event.kind==='cancelled'&&r.event.intentId===job.suppression_id))throw Error('PURGE_INTENT_CANCELLED');
      if(job.state==='intent'){
        await transact(async()=>{
          await client.query('SELECT id FROM accounts WHERE id=$1 FOR UPDATE',[job.owner_id]);
          await client.query('SELECT id FROM purge_jobs WHERE id=$1 FOR UPDATE',[id]);job=await read();
          await this.metadata.validate(client,job);
          await this.journal.append({id:job.suppression_id,kind:'intent',scope:scope(job)});
          // Revalidate after external I/O: a session/deadline may have changed.
          await this.metadata.validate(client,job);await this.metadata.seal(client,job);
          await client.query("UPDATE purge_jobs SET state='objects' WHERE id=$1",[id]);
        });job=await read();
      }
      // A missing external journal must not be reconstructed from a restored DB.
      const intent=(await this.journal.read()).find(r=>r.event.id===job.suppression_id)?.event;
      if(!intent||canonicalize(intent)!==canonicalize({id:job.suppression_id,kind:'intent',scope:scope(job)}))throw Error('PURGE_INTENT_UNCONFIRMED');
      if(job.state==='objects'){
        for(const key of job.object_keys){
          if(job.completed_keys.includes(key))continue;
          await this.blobs.remove(key);
          await client.query('UPDATE purge_jobs SET completed_keys=array_append(completed_keys,$2) WHERE id=$1 AND NOT $2=ANY(completed_keys)',[id,key]);
        }
        await transact(async()=>{
          await client.query('SELECT id FROM accounts WHERE id=$1 FOR UPDATE',[job.owner_id]);
          await client.query('SELECT id FROM purge_jobs WHERE id=$1 FOR UPDATE',[id]);job=await read();
          if(job.object_keys.some(k=>!job.completed_keys.includes(k)))throw Error('PURGE_OBJECTS_PENDING');
          await this.metadata.remove(client,job);
          await client.query("UPDATE purge_jobs SET state='metadata' WHERE id=$1",[id]);
        });job=await read();
      }
      if(job.state!=='metadata')throw Error('PURGE_STATE_INVALID');
      await this.journal.append({id:purgeConfirmationId(job.suppression_id),kind:'confirmed',intentId:job.suppression_id});
      await transact(async()=>{
        await client.query('SELECT id FROM accounts WHERE id=$1 FOR UPDATE',[job.owner_id]);
        await client.query('SELECT id FROM purge_jobs WHERE id=$1 FOR UPDATE',[id]);const current=await read();
        if(canonicalize(scope(current))!==canonicalize(scope(job))||current.state!=='metadata')throw Error('PURGE_SCOPE_CHANGED');
        await this.metadata.finish(client,current);
        await client.query("UPDATE purge_jobs SET state='complete',completed_at=clock_timestamp() WHERE id=$1",[id]);
      });return 'complete';
    }finally{
      let releaseError:Error|undefined;
      try{if(transaction)await client.query('ROLLBACK');if(locked)await client.query('SELECT pg_advisory_unlock(172903,hashtext($1))',[id]);}
      catch(error){releaseError=error instanceof Error?error:Error('PURGE_CONNECTION_FAILED');}
      client.release(releaseError);
    }
  }
}
