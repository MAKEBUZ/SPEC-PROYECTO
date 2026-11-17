import {createHash,randomUUID} from 'node:crypto';
import type {Pool,PoolClient} from 'pg';
import type {AccountContent,DeletionService} from './deletion.service.js';
import {PurgeWorker,type PurgeJob,type PurgeMetadata} from '../trash/purge.worker.js';
import {purgeAccountResults} from '../operations/purge-results.js';
import {canonicalize} from '../../../../packages/document/src/revision.js';

/** Database-backed content boundary used by the account-deletion service. It
 * queues a recoverable intent only; the worker owns all physical deletion. */
export class AccountPurgeContent implements AccountContent {
 async scope(c:PoolClient,ownerId:string){
  const resources=(await c.query(`SELECT 'project' AS kind,id,name,state,resource_revision AS revision,expires_at AS "expiresAt" FROM projects WHERE owner_id=$1 UNION ALL SELECT 'pattern',id,name,state,resource_revision,expires_at FROM patterns WHERE owner_id=$1 ORDER BY kind,id`,[ownerId])).rows;
  const stats=(await c.query<{versions:string;files:string;bytes:string}>(`SELECT (SELECT count(*) FROM versions v JOIN patterns p ON p.id=v.pattern_id WHERE p.owner_id=$1) AS versions,count(f.id) AS files,COALESCE(sum(f.bytes),0) AS bytes FROM stored_files f JOIN versions v ON v.id=f.version_id JOIN patterns p ON p.id=v.pattern_id WHERE p.owner_id=$1`,[ownerId])).rows[0]!;
  return {resources,versions:Number(stats.versions),files:Number(stats.files),bytes:Number(stats.bytes)};
 }
 async keys(c:PoolClient,ownerId:string){return (await c.query<{private_key:string}>(`SELECT f.private_key FROM publication_files f JOIN publications p ON p.id=f.publication_id WHERE p.owner_id=$1 UNION SELECT f.private_key FROM stored_files f JOIN versions v ON v.id=f.version_id JOIN patterns p ON p.id=v.pattern_id WHERE p.owner_id=$1 ORDER BY private_key`,[ownerId])).rows.map(r=>r.private_key);}
 async requestPurge(c:PoolClient,ownerId:string,requestId:string){
  const old=(await c.query('SELECT owner_id,root_kind,root_id FROM purge_jobs WHERE operation_id=$1',[requestId])).rows[0];
  if(old){if(old.owner_id!==ownerId||old.root_kind!=='account'||old.root_id!==ownerId)throw Error('PURGE_REQUEST_CONFLICT');return;}
  if(!(await c.query("SELECT id FROM accounts WHERE id=$1 AND status='deletion_pending' AND deletion_deadline<=clock_timestamp() FOR UPDATE",[ownerId])).rowCount)throw Error('ACCOUNT_PURGE_NOT_DUE');
  if((await c.query("SELECT id FROM purge_jobs WHERE owner_id=$1 AND state<>'complete' LIMIT 1",[ownerId])).rowCount)throw Error('ACCOUNT_PURGE_DEPENDENCIES_PENDING');
  const capture=await this.scope(c,ownerId),keys=await this.keys(c,ownerId),members=capture.resources.map(r=>r.id as string);
  const digest=createHash('sha256').update(canonicalize({members,keys})).digest('hex');
  await c.query("INSERT INTO purge_jobs(id,owner_id,operation_id,root_kind,root_id,scope_revision,member_ids,object_keys,state,suppression_id) VALUES($1,$2,$3,'account',$2,$4,$5,$6,'intent',$7)",[randomUUID(),ownerId,requestId,digest,members,keys,randomUUID()]);
 }
 async isPurged(c:PoolClient,ownerId:string){
  if((await c.query('SELECT id FROM accounts WHERE id=$1',[ownerId])).rowCount)return false;
  if((await c.query('SELECT id FROM projects WHERE owner_id=$1 UNION ALL SELECT id FROM patterns WHERE owner_id=$1 UNION ALL SELECT id FROM publications WHERE owner_id=$1',[ownerId])).rowCount)return false;
  return !!(await c.query("SELECT id FROM purge_jobs WHERE owner_id=$1 AND root_kind='account' AND state IN ('metadata','complete')",[ownerId])).rowCount;
 }
}
export class AccountPurgeMetadata implements PurgeMetadata {
 constructor(private readonly content:AccountPurgeContent,private readonly confirm:(c:PoolClient,requestId:string)=>Promise<void>){}
 async validate(c:PoolClient,j:PurgeJob){
  if(j.root_kind!=='account'||j.root_id!==j.owner_id)throw Error('ACCOUNT_PURGE_SCOPE_INVALID');
  if(!(await c.query("SELECT a.id FROM accounts a JOIN deletion_checks d ON d.account_id=a.id JOIN account_deletion_jobs q ON q.request_id=d.request_id WHERE a.id=$1 AND a.status='deletion_pending' AND a.deletion_deadline<=clock_timestamp() AND d.state='pending' AND d.request_id=$2 AND q.state='handed_off' FOR UPDATE OF a,d,q",[j.owner_id,j.operation_id])).rowCount)throw Error('ACCOUNT_PURGE_NOT_DUE');
  const members=(await this.content.scope(c,j.owner_id)).resources.map(r=>r.id as string),keys=await this.content.keys(c,j.owner_id);
  if(members.length!==j.member_ids.length||members.some(id=>!j.member_ids.includes(id))||keys.length!==j.object_keys.length||keys.some(key=>!j.object_keys.includes(key)))throw Error('PURGE_SCOPE_CHANGED');
 }
 async seal(c:PoolClient,j:PurgeJob){await c.query("UPDATE trash_batches SET state='purging' WHERE owner_id=$1 AND state='trashed'",[j.owner_id]);}
 async remove(c:PoolClient,j:PurgeJob){
  await this.validate(c,j);
  await c.query('DELETE FROM stored_files WHERE version_id IN (SELECT v.id FROM versions v JOIN patterns p ON p.id=v.pattern_id WHERE p.owner_id=$1)',[j.owner_id]);
  await c.query('DELETE FROM versions WHERE pattern_id IN (SELECT id FROM patterns WHERE owner_id=$1)',[j.owner_id]);
  await c.query('DELETE FROM publication_files WHERE publication_id IN (SELECT id FROM publications WHERE owner_id=$1)',[j.owner_id]);
  await c.query('DELETE FROM publications WHERE owner_id=$1',[j.owner_id]);
  await c.query('DELETE FROM patterns WHERE owner_id=$1',[j.owner_id]);
  await c.query('DELETE FROM projects WHERE owner_id=$1',[j.owner_id]);
  await c.query('DELETE FROM trash_batches WHERE owner_id=$1',[j.owner_id]);
  await c.query('DELETE FROM outbox_jobs WHERE account_id=$1',[j.owner_id]);
  await c.query('DELETE FROM one_use_tokens WHERE account_id=$1',[j.owner_id]);
  await c.query('DELETE FROM sessions WHERE account_id=$1',[j.owner_id]);
  const removed=await c.query('DELETE FROM accounts WHERE id=$1',[j.owner_id]);if(removed.rowCount!==1)throw Error('ACCOUNT_PURGE_MISSING');
  await purgeAccountResults(c,j.owner_id);
 }
 finish(c:PoolClient,j:PurgeJob){return this.confirm(c,j.operation_id);}
}
export class AccountPurgeJobs {
 private stopped=false;
 private running:Promise<void>|undefined;private timer:ReturnType<typeof setInterval>|undefined;
 constructor(private readonly pool:Pool,private readonly deletion:DeletionService,private readonly worker:PurgeWorker){}
 run(){if(this.stopped)return this.running??Promise.resolve();if(this.running)return this.running;const next=(async()=>{
  // A resource purge may still be completing; continue already handed-off jobs.
  await this.deletion.runDue().catch(()=>undefined);
  await this.worker.reconcile(['account']);
  let after='00000000-0000-0000-0000-000000000000';
  for(;;){const jobs=(await this.pool.query<{id:string}>("SELECT id FROM purge_jobs WHERE root_kind='account' AND state<>'complete' AND id>$1 ORDER BY id LIMIT 100",[after])).rows;if(!jobs.length)break;
   for(const job of jobs)await this.worker.run(job.id).catch(()=>undefined);after=jobs.at(-1)!.id;
  }
 })();this.running=next;void next.finally(()=>{if(this.running===next)this.running=undefined;}).catch(()=>undefined);return next;}
 onModuleInit(){this.timer=setInterval(()=>{void this.run().catch(()=>undefined);},30000);this.timer.unref();void this.run().catch(()=>undefined);}
 async onModuleDestroy(){this.stopped=true;if(this.timer)clearInterval(this.timer);await this.running?.catch(()=>undefined);}
}
