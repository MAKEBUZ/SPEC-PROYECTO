import { beforeAll,afterAll,it,expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { startAccountHost } from '../support/account-host.js';
import type { AccountHost,Session } from '../support/account-host.js';
import { DTO } from '../../packages/contracts/src/http-dto.js';
let host:AccountHost;
beforeAll(async()=>{host=await startAccountHost();},30000);afterAll(async()=>{await host?.close();});
async function project(session:Session){return (await host.request('POST','/projects',{operationId:randomUUID(),name:'Proyecto'},session)).body.id as string;}
async function pattern(projectId:string,owner:string){const id=randomUUID();await host.pool.query("INSERT INTO patterns(id,project_id,owner_id,name) VALUES($1,$2,$3,'Pieza')",[id,projectId,owner]);return id;}
async function trash(kind:'project'|'pattern',id:string,session:Session){const scope=await host.request('GET',`/destructive-scope?kind=${kind}&id=${id}&action=trash`,undefined,session);expect(scope.status).toBe(200);return host.request('POST',`/${kind}s/${id}/trash`,{operationId:randomUUID(),scopeRevision:scope.body.scopeRevision,confirmation:true},session);}
it('captures active children only and restores the original batch without changing independent deadlines',async()=>{
  const a=await host.verifiedAccount(),id=await project(a.session),old=await pattern(id,a.accountId),active=await pattern(id,a.accountId);
  expect((await trash('pattern',old,a.session)).body.outcome).toBe('success');const previous=(await host.pool.query('SELECT expires_at FROM patterns WHERE id=$1',[old])).rows[0].expires_at;
  expect((await trash('project',id,a.session)).body.outcome).toBe('success');const root=(await host.pool.query('SELECT * FROM projects WHERE id=$1',[id])).rows[0];expect(root.expires_at.getTime()-root.trashed_at.getTime()).toBe(30*86400000);
  const restoring=await host.request('GET',`/destructive-scope?kind=project&id=${id}&action=restore`,undefined,a.session);
  const restoreScope=DTO.ResourceScope.parse(restoring.body);expect(restoreScope.resources.map(r=>r.id).sort()).toEqual([id,active].sort());expect(restoreScope.resources.some(r=>r.id===old)).toBe(false);
  const listed=await host.request('GET','/trash?limit=1',undefined,a.session);expect(DTO.TrashPage.parse(listed.body).items).toHaveLength(1);expect(listed.body.nextCursor).toEqual(expect.any(String));
  expect((await host.request('GET',`/projects/${id}`,undefined,a.session)).status).toBe(409);
  const oldRow=(await host.pool.query('SELECT * FROM patterns WHERE id=$1',[old])).rows[0];const blocked=await host.request('POST',`/trash/pattern/${old}/restore`,{operationId:randomUUID(),expectedResourceRevision:oldRow.resource_revision,confirmation:true},a.session);expect(blocked.body).toMatchObject({outcome:'failure',data:{code:'PARENT_TRASHED'}});
  const restored=await host.request('POST',`/trash/project/${id}/restore`,{operationId:randomUUID(),expectedResourceRevision:root.resource_revision,confirmation:true},a.session);expect(restored.body.outcome).toBe('success');
  const children=(await host.pool.query('SELECT id,state,expires_at FROM patterns WHERE project_id=$1',[id])).rows;expect(children.find(p=>p.id===active).state).toBe('active');expect(children.find(p=>p.id===old)).toMatchObject({state:'trashed',expires_at:previous});
});
it('rejects expired or incomplete batches without partially restoring children',async()=>{
  const a=await host.verifiedAccount(),id=await project(a.session),member=await pattern(id,a.accountId),batch=randomUUID();
  await host.pool.query(`WITH t AS MATERIALIZED(SELECT clock_timestamp() AS now) INSERT INTO trash_batches(id,owner_id,cause_operation_id,root_kind,root_id,member_ids,confirmed_at,expires_at) SELECT $1,$2,$3,'project',$4,$5,now-interval '31 days',now-interval '1 day' FROM t`,[batch,a.accountId,randomUUID(),id,[member]]);
  await host.pool.query("UPDATE projects p SET state='trashed',trash_batch_id=b.id,trashed_at=b.confirmed_at,expires_at=b.expires_at FROM trash_batches b WHERE p.id=$1 AND b.id=$2",[id,batch]);
  const expired=await host.request('POST',`/trash/project/${id}/restore`,{operationId:randomUUID(),expectedResourceRevision:'1',confirmation:true},a.session);expect(expired.body).toMatchObject({outcome:'failure',data:{code:'RETENTION_EXPIRED'}});
  const other=await project(a.session),child=await pattern(other,a.accountId);await trash('project',other,a.session);await host.pool.query('DELETE FROM patterns WHERE id=$1',[child]);
  const row=(await host.pool.query('SELECT * FROM projects WHERE id=$1',[other])).rows[0],incomplete=await host.request('POST',`/trash/project/${other}/restore`,{operationId:randomUUID(),expectedResourceRevision:row.resource_revision,confirmation:true},a.session);expect(incomplete.body).toMatchObject({outcome:'failure',data:{code:'DEPENDENCIES_BLOCK'}});expect((await host.pool.query('SELECT state FROM projects WHERE id=$1',[other])).rows[0].state).toBe('trashed');
});
it('rejects obsolete scope and non-owner requests without changing resources',async()=>{
  const a=await host.verifiedAccount(),b=await host.verifiedAccount(),id=await project(a.session),scope=await host.request('GET',`/destructive-scope?kind=project&id=${id}&action=trash`,undefined,a.session);
  await pattern(id,a.accountId);const rejected=await host.request('POST',`/projects/${id}/trash`,{operationId:randomUUID(),scopeRevision:scope.body.scopeRevision,confirmation:true},a.session);expect(rejected.body).toMatchObject({outcome:'failure',data:{code:'SCOPE_CHANGED'}});
  expect((await host.request('GET',`/destructive-scope?kind=project&id=${id}&action=trash`,undefined,b.session)).status).toBe(404);expect((await host.pool.query('SELECT state FROM projects WHERE id=$1',[id])).rows[0].state).toBe('active');
});
it('rolls back the entire trash batch if the session expires before confirmation',async()=>{
  const a=await host.verifiedAccount(),id=await project(a.session),child=await pattern(id,a.accountId),scope=await host.request('GET',`/destructive-scope?kind=project&id=${id}&action=trash`,undefined,a.session);
  await host.pool.query(`CREATE FUNCTION delay_trash_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_sleep(0.35); RETURN NEW; END $$; CREATE TRIGGER delay_trash_test BEFORE UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION delay_trash_test()`);
  try{
    await host.pool.query(`WITH old AS(DELETE FROM sessions WHERE id=$1 RETURNING *),instant AS MATERIALIZED(SELECT clock_timestamp() AS now) INSERT INTO sessions SELECT id,account_id,token_hash,access_class,now,now+interval '250 milliseconds',revoked_at FROM old,instant`,[a.session.view.id]);
    const result=await host.request('POST',`/projects/${id}/trash`,{operationId:randomUUID(),scopeRevision:scope.body.scopeRevision,confirmation:true},a.session);expect(result.body).toMatchObject({outcome:'failure',data:{code:'SESSION_EXPIRED'}});
    expect((await host.pool.query('SELECT state FROM projects WHERE id=$1',[id])).rows[0].state).toBe('active');expect((await host.pool.query('SELECT state FROM patterns WHERE id=$1',[child])).rows[0].state).toBe('active');expect((await host.pool.query('SELECT count(*) FROM trash_batches WHERE root_id=$1',[id])).rows[0].count).toBe('0');
  }finally{await host.pool.query('DROP TRIGGER delay_trash_test ON projects; DROP FUNCTION delay_trash_test()');}
});
it('keeps the original batch scope immutable and records purge progress monotonically',async()=>{
  const a=await host.verifiedAccount(),id=await project(a.session);await trash('project',id,a.session);
  await expect(host.pool.query("UPDATE trash_batches SET expires_at=expires_at+interval '1 day' WHERE root_id=$1",[id])).rejects.toThrow();
  const job=randomUUID(),operation=randomUUID(),key='a'.repeat(64);
  await host.pool.query(`INSERT INTO purge_jobs(id,owner_id,operation_id,root_kind,root_id,scope_revision,member_ids,object_keys,state,suppression_id) VALUES($1,$2,$3,'project',$4,'scope','{}',$5,'intent',$6)`,[job,a.accountId,operation,id,[key],randomUUID()]);
  await host.pool.query("UPDATE purge_jobs SET state='objects',completed_keys=$2 WHERE id=$1",[job,[key]]);
  await expect(host.pool.query("UPDATE purge_jobs SET completed_keys='{}' WHERE id=$1",[job])).rejects.toThrow('Immutable purge input');
  await expect(host.pool.query("UPDATE purge_jobs SET object_keys='{}' WHERE id=$1",[job])).rejects.toThrow();
});
