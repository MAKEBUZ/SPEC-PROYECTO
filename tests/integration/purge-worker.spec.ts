import {beforeAll,afterAll,it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {startAccountHost,type AccountHost} from '../support/account-host.js';
import {publishedFixture} from '../support/publication-fixture.js';
import {LocalSuppressionLog,suppressionPlan} from '../../apps/api/src/storage/suppression-log.js';
import {PurgeWorker,type PurgeJob,type PurgeJournal,type PurgeMetadata} from '../../apps/api/src/trash/purge.worker.js';
import {ResourcePurgeMetadata} from '../../apps/api/src/trash/resource-purge.js';
import {createBackupRuntime} from '../../apps/api/src/storage/backup-runtime.js';
import {BACKUP_RETENTION_MS} from '../../apps/api/src/storage/backup-policy.js';
let host:AccountHost;const directories:string[]=[];
beforeAll(async()=>{host=await startAccountHost();},30000);
afterAll(async()=>{await host?.close();for(const directory of directories){if(!resolve(directory).startsWith(resolve(tmpdir(),'patron-purge-')))throw Error('Unsafe cleanup');await rm(directory,{recursive:true,force:true});}});
async function fixture(){
 const account=await host.verifiedAccount(),published=await publishedFixture(host,account.session,0,true);
 const scope=await host.request('GET',`/destructive-scope?kind=project&id=${published.projectId}&action=trash`,undefined,account.session);
 expect((await host.request('POST',`/projects/${published.projectId}/trash`,{operationId:randomUUID(),scopeRevision:scope.body.scopeRevision,confirmation:true},account.session)).body.outcome).toBe('success');
 const job:PurgeJob={id:randomUUID(),owner_id:account.accountId,operation_id:randomUUID(),root_kind:'project',root_id:published.projectId,member_ids:[published.patternId],object_keys:[],completed_keys:[],suppression_id:randomUUID(),state:'intent'};
 const metadata=new ResourcePurgeMetadata(),client=await host.pool.connect();try{job.object_keys=await metadata.keys(client,job);}finally{client.release();}
 // Internal admission fixture, not an implemented HTTP authorization endpoint.
 await host.pool.query("INSERT INTO operation_results(requester_id,operation_type,operation_id,request_hash,state,historical_owner_id) VALUES($1,'purge',$2,'test:authorized','pending',$1)",[job.owner_id,job.operation_id]);
 await host.pool.query("INSERT INTO purge_jobs(id,owner_id,operation_id,root_kind,root_id,scope_revision,member_ids,object_keys,state,suppression_id) VALUES($1,$2,$3,$4,$5,'fixture',$6,$7,'intent',$8)",[job.id,job.owner_id,job.operation_id,job.root_kind,job.root_id,job.member_ids,job.object_keys,job.suppression_id]);
 const directory=await mkdtemp(join(tmpdir(),'patron-purge-'));directories.push(directory);const journal=new LocalSuppressionLog(directory);
 return {account,published,job,metadata,journal};
}
async function state(id:string){return (await host.pool.query('SELECT * FROM purge_jobs WHERE id=$1',[id])).rows[0];}
it('removes PDF proofs, all files and quota before confirming once; restart is idempotent',async()=>{
 const f=await fixture(),worker=new PurgeWorker(host.pool,host.blobs,f.journal,f.metadata);
 expect(f.job.object_keys).toHaveLength(3);expect(await worker.run(f.job.id)).toBe('complete');expect(await worker.run(f.job.id)).toBe('complete');
 for(const key of f.job.object_keys)await expect(host.blobs.get(key)).rejects.toMatchObject({code:'ENOENT'});
 expect((await host.pool.query('SELECT used_bytes,reserved_bytes FROM accounts WHERE id=$1',[f.job.owner_id])).rows[0]).toEqual({used_bytes:'0',reserved_bytes:'0'});
 expect((await host.pool.query('SELECT id FROM projects WHERE id=$1',[f.job.root_id])).rowCount).toBe(0);
 expect((await state(f.job.id)).state).toBe('complete');expect(await f.journal.read()).toHaveLength(2);
 expect(suppressionPlan(await f.journal.read(),{sequence:0,hash:null})[0]!.objectKeys).toHaveLength(3);
 expect((await host.pool.query('SELECT state,outcome FROM operation_results WHERE operation_id=$1',[f.job.operation_id])).rows[0]).toEqual({state:'resolved',outcome:'success'});
},30000);
it.each(['intent','object','metadata','confirmation','result'] as const)('resumes a failure at %s without partial success or replaying completed removals',async point=>{
 const f=await fixture();let failed=false;const removed:string[]=[];
 const fail=()=>{if(!failed){failed=true;throw Error('injected');}};
 const journal:PurgeJournal={read:()=>f.journal.read(),append:async e=>{if(e.kind==='intent'&&point==='intent'||e.kind==='confirmed'&&point==='confirmation')fail();return f.journal.append(e);}};
 const metadata:PurgeMetadata={validate:(c,j)=>f.metadata.validate(c,j),seal:(c,j)=>f.metadata.seal(c,j),remove:async(c,j)=>{await f.metadata.remove(c,j);if(point==='metadata')fail();},finish:async(c,j)=>{await f.metadata.finish(c,j);if(point==='result')fail();}};
 const blobs={remove:async(key:string)=>{if(point==='object'&&removed.length===1)fail();await host.blobs.remove(key);removed.push(key);}};
 await expect(new PurgeWorker(host.pool,blobs,journal,metadata).run(f.job.id)).rejects.toThrow('injected');
 expect((await state(f.job.id)).state).not.toBe('complete');
 expect((await host.pool.query('SELECT state FROM operation_results WHERE operation_id=$1',[f.job.operation_id])).rows[0].state).toBe('pending');
 if(point==='object'||point==='metadata')expect((await host.pool.query('SELECT used_bytes FROM accounts WHERE id=$1',[f.job.owner_id])).rows[0].used_bytes).not.toBe('0');
 if(point==='object'||point==='metadata'||point==='confirmation'){const records=await f.journal.read();expect(()=>suppressionPlan(records,{sequence:0,hash:null})).toThrow('RESTORE_REQUIRES_RECONCILIATION');}
 expect(await new PurgeWorker(host.pool,blobs,f.journal,f.metadata).run(f.job.id)).toBe('complete');
 expect(new Set(removed).size).toBe(3);expect(removed).toHaveLength(3);expect(await f.journal.read()).toHaveLength(2);
},30000);
it('blocks recoverable independent children before writing an intent or removing files',async()=>{
 const f=await fixture(),id=randomUUID(),batch=randomUUID();
 await host.pool.query(`WITH t AS MATERIALIZED(SELECT clock_timestamp() AS now) INSERT INTO trash_batches(id,owner_id,cause_operation_id,root_kind,root_id,member_ids,confirmed_at,expires_at) SELECT $1,$2,$3,'pattern',$4,ARRAY[$4]::uuid[],now,now+interval '30 days' FROM t`,[batch,f.job.owner_id,randomUUID(),id]);
 await host.pool.query(`INSERT INTO patterns(id,project_id,owner_id,name,state,trash_batch_id,trashed_at,expires_at) SELECT $1,$2,$3,'Independiente','trashed',id,confirmed_at,expires_at FROM trash_batches WHERE id=$4`,[id,f.job.root_id,f.job.owner_id,batch]);
 await expect(new PurgeWorker(host.pool,host.blobs,f.journal,f.metadata).run(f.job.id)).rejects.toThrow('PURGE_SCOPE_CHANGED');
 expect(await f.journal.read()).toHaveLength(0);for(const key of f.job.object_keys)expect((await host.blobs.get(key)).length).toBeGreaterThan(0);
},30000);
it('refuses to reconstruct lost external evidence from a DB job after sealing',async()=>{
 const f=await fixture();await expect(new PurgeWorker(host.pool,{remove:async()=>{throw Error('offline');}},f.journal,f.metadata).run(f.job.id)).rejects.toThrow('offline');
 const empty=await mkdtemp(join(tmpdir(),'patron-purge-'));directories.push(empty);
 await expect(new PurgeWorker(host.pool,host.blobs,new LocalSuppressionLog(empty),f.metadata).run(f.job.id)).rejects.toThrow('PURGE_INTENT_UNCONFIRMED');
 for(const key of f.job.object_keys)expect((await host.blobs.get(key)).length).toBeGreaterThan(0);
},30000);
it('T087 reconciles a durable intent and interrupted final result against its exact job, never missing DB rows',async()=>{
 const f=await fixture();let failed=false;
 const metadata:PurgeMetadata={validate:(c,j)=>f.metadata.validate(c,j),seal:(c,j)=>f.metadata.seal(c,j),remove:(c,j)=>f.metadata.remove(c,j),finish:async(c,j)=>{await f.metadata.finish(c,j);if(!failed){failed=true;throw Error('lost result');}}};
 const worker=new PurgeWorker(host.pool,host.blobs,f.journal,metadata);
 await expect(worker.run(f.job.id)).rejects.toThrow('lost result');expect((await state(f.job.id)).state).toBe('metadata');
 expect(await worker.reconcile(['project','pattern'])).toEqual([{intentId:f.job.suppression_id,state:'complete'}]);
 expect((await state(f.job.id)).state).toBe('complete');expect(await f.journal.read()).toHaveLength(2);
 const orphan=randomUUID();await f.journal.append({id:orphan,kind:'intent',scope:{kind:'pattern',resourceIds:[randomUUID()],objectKeys:[]}});
 expect((await worker.reconcile(['project','pattern'])).find(r=>r.intentId===orphan)?.state).toBe('blocked');

 const records=await f.journal.read();expect(()=>suppressionPlan(records,{sequence:0,hash:null})).toThrow('RESTORE_REQUIRES_RECONCILIATION');
},30000);
it('T087 refuses a changed job scope and does not invent confirmation for a complete row',async()=>{
 const f=await fixture();await expect(new PurgeWorker(host.pool,{remove:async()=>{throw Error('offline');}},f.journal,f.metadata).run(f.job.id)).rejects.toThrow('offline');
 const worker=new PurgeWorker(host.pool,host.blobs,f.journal,f.metadata);
 const mismatched=await mkdtemp(join(tmpdir(),'patron-purge-'));directories.push(mismatched);const badJournal=new LocalSuppressionLog(mismatched);
 await badJournal.append({id:f.job.suppression_id,kind:'intent',scope:{kind:'project',resourceIds:[randomUUID()],objectKeys:f.job.object_keys}});
 expect(await new PurgeWorker(host.pool,host.blobs,badJournal,f.metadata).reconcile(['project'])).toEqual([{intentId:f.job.suppression_id,state:'blocked'}]);
 await host.pool.query("UPDATE purge_jobs SET state='complete',completed_at=clock_timestamp() WHERE id=$1",[f.job.id]);
 expect(await worker.reconcile(['project'])).toEqual([{intentId:f.job.suppression_id,state:'blocked'}]);
 expect(await f.journal.read()).toHaveLength(1);for(const key of f.job.object_keys)expect((await host.blobs.get(key)).length).toBeGreaterThan(0);
},30000);
it('T087 compacts through the runtime only after the last restore copy is physically retired',async()=>{
 const f=await fixture();await new PurgeWorker(host.pool,host.blobs,f.journal,f.metadata).run(f.job.id);
 const directory=await mkdtemp(join(tmpdir(),'patron-purge-'));directories.push(directory);let now=1000,fail=true;
 const runtime=createBackupRuntime({pool:host.pool,directory,journal:f.journal,now:()=>now,shutdown:async()=>{throw Error('forbidden');},run:async()=>{throw Error('unused');},retireCopy:async()=>{if(fail)throw Error('occupied');}});
 const backup={backupId:randomUUID(),schema:'test',engine:'18',capturedAt:now,expiresAt:now+BACKUP_RETENTION_MS,dumpHash:'a'.repeat(64),rolesHash:'b'.repeat(64),objects:[],watermark:{sequence:0,hash:null}};
 await runtime.catalog.reserve(backup);await runtime.catalog.complete(backup.backupId);await runtime.catalog.copy(backup.backupId,randomUUID(),'restore','patron-backup-'+randomUUID(),now);
 await runtime.maintain();expect((await f.journal.read())[0]!.event.kind).toBe('intent');
 now=backup.expiresAt;await expect(runtime.maintain()).rejects.toThrow('occupied');expect((await f.journal.read())[0]!.event.kind).toBe('intent');
 fail=false;await runtime.maintain();const records=await f.journal.read();expect(records.every(r=>r.event.kind==='retired')).toBe(true);
 expect(suppressionPlan(records,{sequence:records.length,hash:records.at(-1)!.hash})).toEqual([]);
 expect(()=>suppressionPlan(records,backup.watermark)).toThrow('SUPPRESSION_WATERMARK_RETIRED');
 expect(await new PurgeWorker(host.pool,host.blobs,f.journal,f.metadata).run(f.job.id)).toBe('complete');
},30000);
