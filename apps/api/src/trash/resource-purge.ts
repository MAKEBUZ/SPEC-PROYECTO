import type { PoolClient } from 'pg';
import type { PurgeJob,PurgeMetadata } from './purge.worker.js';

/** Resource-only metadata adapter. Account removal has a separate owner which
 * also accounts for credentials and the retained deletion-check capability. */
export class ResourcePurgeMetadata implements PurgeMetadata {
  private ids(job:PurgeJob){if(job.root_kind==='account')throw Error('ACCOUNT_PURGE_ADAPTER_REQUIRED');return job.root_kind==='pattern'?[job.root_id]:job.member_ids;}
  async validate(c:PoolClient,job:PurgeJob){
    const ids=this.ids(job),table=job.root_kind==='project'?'projects':'patterns';
    if((await c.query("SELECT id FROM purge_jobs WHERE owner_id=$1 AND id<>$2 AND state<>'complete' AND (root_kind='account' OR root_id=ANY($3::uuid[]) OR member_ids && $3::uuid[]) LIMIT 1",[job.owner_id,job.id,[job.root_id,...ids]])).rowCount)throw Error('PURGE_DEPENDENCIES_BLOCK');
    const root=(await c.query(`SELECT * FROM ${table} WHERE id=$1 AND owner_id=$2 FOR UPDATE`,[job.root_id,job.owner_id])).rows[0];
    if(!root||root.state!=='trashed'||!root.trash_batch_id)throw Error('PURGE_RESOURCE_UNAVAILABLE');
    const batch=(await c.query('SELECT * FROM trash_batches WHERE id=$1 FOR UPDATE',[root.trash_batch_id])).rows[0];
    if(!batch||batch.state!=='trashed'||batch.root_kind!==job.root_kind||batch.root_id!==job.root_id)throw Error('PURGE_SCOPE_CHANGED');
    const children=(await c.query('SELECT *,expires_at>clock_timestamp() AS live FROM patterns WHERE '+(job.root_kind==='project'?'project_id=$1':'id=$1')+' ORDER BY id FOR UPDATE',[job.root_id])).rows;
    if(children.length!==ids.length||children.some(p=>!ids.includes(p.id)||p.owner_id!==job.owner_id||p.state!=='trashed'))throw Error('PURGE_SCOPE_CHANGED');
    if(job.root_kind==='project'&&children.some(p=>p.trash_batch_id!==root.trash_batch_id&&p.live))throw Error('PURGE_DEPENDENCIES_BLOCK');
    const keys=await this.keys(c,job);
    if(keys.length!==job.object_keys.length||keys.some(k=>!job.object_keys.includes(k)))throw Error('PURGE_SCOPE_CHANGED');
  }
  private async publications(c:PoolClient,job:PurgeJob){
    return (await c.query<{id:string}>('SELECT id FROM publications WHERE owner_id=$1 AND '+(job.root_kind==='project'?'project_id=$2':'pattern_id=$2')+' ORDER BY id FOR UPDATE',[job.owner_id,job.root_id])).rows.map(p=>p.id);
  }
  async keys(c:PoolClient,job:PurgeJob){
    const publications=await this.publications(c,job);
    return (await c.query<{private_key:string}>(`SELECT f.private_key FROM publication_files f WHERE publication_id=ANY($1::uuid[]) UNION SELECT f.private_key FROM stored_files f JOIN versions v ON v.id=f.version_id WHERE v.pattern_id=ANY($2::uuid[]) ORDER BY private_key`,[publications,this.ids(job)])).rows.map(f=>f.private_key);
  }
  async seal(c:PoolClient,job:PurgeJob){
    await c.query("UPDATE trash_batches SET state='purging' WHERE id IN (SELECT trash_batch_id FROM patterns WHERE id=ANY($1::uuid[]) UNION SELECT trash_batch_id FROM projects WHERE id=$2 AND $3='project')",[this.ids(job),job.root_id,job.root_kind]);
  }
  async remove(c:PoolClient,job:PurgeJob){
    const ids=this.ids(job),publications=await this.publications(c,job);
    // No metadata is touched unless the persisted object set is still exact.
    const keys=await this.keys(c,job);
    if(keys.length!==job.object_keys.length||keys.some(k=>!job.object_keys.includes(k)))throw Error('PURGE_SCOPE_CHANGED');
    const used=(await c.query<{bytes:string}>('SELECT COALESCE(sum(f.bytes),0) AS bytes FROM stored_files f JOIN versions v ON v.id=f.version_id WHERE v.pattern_id=ANY($1::uuid[])',[ids])).rows[0]!.bytes;
    const reserved=(await c.query<{bytes:string}>('SELECT COALESCE(sum(reservation_bytes),0) AS bytes FROM publications WHERE id=ANY($1::uuid[])',[publications])).rows[0]!.bytes;
    await c.query('DELETE FROM stored_files WHERE version_id IN (SELECT id FROM versions WHERE pattern_id=ANY($1::uuid[]))',[ids]);
    await c.query('DELETE FROM versions WHERE pattern_id=ANY($1::uuid[])',[ids]);
    await c.query('DELETE FROM publication_files WHERE publication_id=ANY($1::uuid[])',[publications]);
    await c.query('DELETE FROM publications WHERE id=ANY($1::uuid[])',[publications]);
    await c.query('DELETE FROM patterns WHERE id=ANY($1::uuid[]) AND owner_id=$2',[ids,job.owner_id]);
    if(job.root_kind==='project')await c.query('DELETE FROM projects WHERE id=$1 AND owner_id=$2',[job.root_id,job.owner_id]);
    const released=await c.query('UPDATE accounts SET used_bytes=used_bytes-$2,reserved_bytes=reserved_bytes-$3 WHERE id=$1 AND used_bytes>=$2 AND reserved_bytes>=$3',[job.owner_id,used,reserved]);
    if(released.rowCount!==1)throw Error('PURGE_QUOTA_INCONSISTENT');
    await c.query("UPDATE trash_batches SET state='purged' WHERE owner_id=$1 AND state='purging' AND (root_id=$2 OR root_id=ANY($3::uuid[]))",[job.owner_id,job.root_id,ids]);
  }
  async finish(c:PoolClient,job:PurgeJob){
    const result=await c.query(`UPDATE operation_results SET state='resolved',outcome='success',data=$3::jsonb,confirmed_at=clock_timestamp() WHERE requester_id=$1 AND operation_type='purge' AND operation_id=$2 AND state='pending'`,[job.owner_id,job.operation_id,JSON.stringify({kind:job.root_kind,id:job.root_id})]);
    if(result.rowCount!==1)throw Error('PURGE_OPERATION_MISSING');
  }
}
