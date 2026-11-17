import {beforeAll,afterAll,it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {startAccountHost,type AccountHost} from '../support/account-host.js';
import {publishedFixture} from '../support/publication-fixture.js';
import {LocalSuppressionLog} from '../../apps/api/src/storage/suppression-log.js';
import {DTO} from '../../packages/contracts/src/http-dto.js';
let host:AccountHost,directory:string,journal:LocalSuppressionLog;
beforeAll(async()=>{directory=await mkdtemp(join(tmpdir(),'patron-purge-api-'));journal=new LocalSuppressionLog(directory);host=await startAccountHost(journal);},30000);
afterAll(async()=>{await host?.close();if(directory){if(!resolve(directory).startsWith(resolve(tmpdir(),'patron-purge-api-')))throw Error('Unsafe cleanup');await rm(directory,{recursive:true,force:true});}});
async function fixture(){
 const a=await host.verifiedAccount(),p=await publishedFixture(host,a.session);
 const scope=await host.request('GET',`/destructive-scope?kind=project&id=${p.projectId}&action=trash`,undefined,a.session);
 await host.request('POST',`/projects/${p.projectId}/trash`,{operationId:randomUUID(),scopeRevision:scope.body.scopeRevision,confirmation:true},a.session);
 const permanent=await host.request('GET',`/destructive-scope?kind=project&id=${p.projectId}&action=purge`,undefined,a.session);
 return {a,p,input:{operationId:randomUUID(),scopeRevision:permanent.body.scopeRevision,confirmation:true,acknowledgePermanentLoss:true},path:`/trash/project/${p.projectId}`};
}
it('accepts a confirmed owner request once, blocks restoration and reports success only after durable purge',async()=>{
 const f=await fixture(),accepted=await host.request('DELETE',f.path,f.input,f.a.session);expect(accepted.status).toBe(200);expect(accepted.body.state).toBe('pending');
 expect(DTO.MutationResult.parse(accepted.body)).toEqual({operationId:f.input.operationId,state:'pending'});
 expect((await host.request('DELETE',f.path,f.input,f.a.session)).body).toEqual(accepted.body);
 const root=(await host.pool.query('SELECT resource_revision FROM projects WHERE id=$1',[f.p.projectId])).rows[0];
 expect((await host.request('POST',`/trash/project/${f.p.projectId}/restore`,{operationId:randomUUID(),expectedResourceRevision:root.resource_revision,confirmation:true},f.a.session)).body).toMatchObject({outcome:'failure',data:{code:'DEPENDENCIES_BLOCK'}});
 await host.finishPurges();expect((await host.request('DELETE',f.path,f.input,f.a.session)).body).toMatchObject({state:'resolved',outcome:'success'});
 expect((await host.pool.query('SELECT id FROM projects WHERE id=$1',[f.p.projectId])).rowCount).toBe(0);
},30000);
it('rejects missing confirmation, another account and changed scope without deleting',async()=>{
 const f=await fixture(),other=await host.verifiedAccount(),before=(await journal.read()).length;
 expect((await host.request('DELETE',f.path,{...f.input,acknowledgePermanentLoss:false},f.a.session)).status).toBe(400);
 expect((await host.request('DELETE',f.path,f.input,other.session)).body).toMatchObject({state:'resolved',outcome:'failure',data:{code:'RESOURCE_UNAVAILABLE'}});
 expect((await host.request('DELETE',f.path,{...f.input,scopeRevision:'stale'},f.a.session)).body).toMatchObject({state:'resolved',outcome:'failure',data:{code:'SCOPE_CHANGED'}});
 expect((await journal.read()).length).toBe(before);expect((await host.pool.query('SELECT id FROM projects WHERE id=$1',[f.p.projectId])).rowCount).toBe(1);
},30000);
it('rechecks session after external evidence and records confirmed rollback, never a runnable deletion',async()=>{
 const f=await fixture(),append=journal.append.bind(journal),before=(await journal.read()).length;
 // Revocation takes the session lock held by the request, so use elapsed expiry
 // instead of a competing writer to exercise the final authorization boundary.
 journal.append=async event=>{const record=await append(event);if(event.kind==='intent')await new Promise(r=>setTimeout(r,400));return record;};
 try{
  await host.pool.query(`WITH old AS(DELETE FROM sessions WHERE id=$1 RETURNING *),instant AS MATERIALIZED(SELECT clock_timestamp() AS now) INSERT INTO sessions SELECT id,account_id,token_hash,access_class,now,now+interval '300 milliseconds',revoked_at FROM old,instant`,[f.a.session.view.id]);
  expect((await host.request('DELETE',f.path,f.input,f.a.session)).body).toMatchObject({state:'resolved',outcome:'failure',data:{code:'SESSION_EXPIRED'}});
  expect((await host.pool.query('SELECT id FROM purge_jobs WHERE operation_id=$1',[f.input.operationId])).rowCount).toBe(0);
  expect((await host.pool.query('SELECT id FROM projects WHERE id=$1',[f.p.projectId])).rowCount).toBe(1);
  const records=await journal.read();expect(records.length).toBe(before+2);
  expect(records.at(-1)!.event).toMatchObject({kind:'cancelled',intentId:records.at(-2)!.event.id});
 }finally{journal.append=append;}
},30000);
it('automatically purges expired batches but preserves independent children within their original deadline',async()=>{
 const a=await host.verifiedAccount();
 async function expiredProject(){
  const reply=await host.request('POST','/projects',{operationId:randomUUID(),name:'Vencido'},a.session),id=reply.body.id as string,batch=randomUUID();
  await host.pool.query(`WITH t AS MATERIALIZED(SELECT clock_timestamp()-interval '31 days' AS now) INSERT INTO trash_batches(id,owner_id,cause_operation_id,root_kind,root_id,member_ids,confirmed_at,expires_at) SELECT $1,$2,$3,'project',$4,'{}',now,now+interval '30 days' FROM t`,[batch,a.accountId,randomUUID(),id]);
  await host.pool.query("UPDATE projects p SET state='trashed',trash_batch_id=b.id,trashed_at=b.confirmed_at,expires_at=b.expires_at FROM trash_batches b WHERE p.id=$1 AND b.id=$2",[id,batch]);return id;
 }
 const blocked=await expiredProject(),independent=await expiredProject(),child=randomUUID(),batch=randomUUID();
 await host.pool.query(`WITH t AS MATERIALIZED(SELECT clock_timestamp() AS now) INSERT INTO trash_batches(id,owner_id,cause_operation_id,root_kind,root_id,member_ids,confirmed_at,expires_at) SELECT $1,$2,$3,'pattern',$4,ARRAY[$4]::uuid[],now,now+interval '30 days' FROM t`,[batch,a.accountId,randomUUID(),child]);
 await host.pool.query(`INSERT INTO patterns(id,project_id,owner_id,name,state,trash_batch_id,trashed_at,expires_at) SELECT $1,$2,$3,'Hijo recuperable','trashed',id,confirmed_at,expires_at FROM trash_batches WHERE id=$4`,[child,blocked,a.accountId,batch]);
 const deadline=(await host.pool.query('SELECT expires_at FROM patterns WHERE id=$1',[child])).rows[0].expires_at;
 await host.finishPurges();
 expect((await host.pool.query('SELECT id FROM projects WHERE id=$1',[independent])).rowCount).toBe(0);
 expect((await host.pool.query('SELECT id FROM projects WHERE id=$1',[blocked])).rowCount).toBe(1);
 expect((await host.pool.query('SELECT expires_at FROM patterns WHERE id=$1',[child])).rows[0].expires_at).toEqual(deadline);
 expect((await host.pool.query('SELECT id FROM purge_jobs WHERE root_id=$1',[blocked])).rowCount).toBe(0);
});
