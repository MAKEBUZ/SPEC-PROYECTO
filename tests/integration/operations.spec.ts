import { beforeAll,afterAll,it,expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { startAccountHost } from '../support/account-host.js';
import type { AccountHost } from '../support/account-host.js';
import { DTO } from '../../packages/contracts/src/http-dto.js';
import { purgeAccountResults } from '../../apps/api/src/operations/purge-results.js';
let host:AccountHost;
beforeAll(async()=>{host=await startAccountHost();},30000);afterAll(async()=>{await host?.close();});
it('returns public nonce-bound time without a session or account data',async()=>{
  const nonce=randomUUID(),r=await host.request('GET',`/time?nonce=${nonce}`);expect(r.status).toBe(200);expect(r.headers.get('cache-control')).toBe('no-store');expect(DTO.TimeView.parse(r.body).nonce).toBe(nonce);
  expect((await host.request('GET','/time')).status).toBe(400);expect(Object.keys(r.body).sort()).toEqual(['nonce','responseId','serverReceivedAt','serverSentAt']);
});
it('purges the last authorized identity atomically and retains only minimal evidence for a surviving account',async()=>{
  const actor=randomUUID(),owner=randomUUID(),id=randomUUID(),own=randomUUID(),unrelated=randomUUID();
  const client=await host.pool.connect();
  try{
    await client.query('BEGIN');
    for(const account of [actor,owner])await client.query("INSERT INTO accounts(id,email,password_hash,status,verified_at) VALUES($1,$2,'fixture','active',clock_timestamp())",[account,`${account}@example.invalid`]);
    for(const [operation,requester,historicalOwner] of [[id,actor,owner],[own,actor,actor],[unrelated,owner,owner]])await client.query(`INSERT INTO operation_results(requester_id,operation_type,operation_id,historical_owner_id,request_hash,state,outcome,confirmed_at,data) VALUES($1,'purgePattern',$2,$3,'opaque','resolved','success',clock_timestamp(),$4::jsonb)`,[requester,operation,historicalOwner,JSON.stringify({patternId:randomUUID(),id:'private@example.invalid',code:'private@example.invalid',email:'private@example.invalid',credential:'secret',files:[{content:'deleted'}]})]);
    await expect(purgeAccountResults(client,actor)).rejects.toThrow('ACCOUNT_NOT_PURGED');
    await client.query('DELETE FROM accounts WHERE id=$1',[actor]);await purgeAccountResults(client,actor);
    const rows=(await client.query('SELECT operation_id,outcome,data FROM operation_results WHERE operation_id=ANY($1::uuid[])',[[id,own,unrelated]])).rows;
    expect(rows).toHaveLength(2);expect(rows.find(r=>r.operation_id===id)).toMatchObject({outcome:'success'});
    expect(Object.keys(rows.find(r=>r.operation_id===id).data)).toEqual(['patternId']);
    expect(rows.find(r=>r.operation_id===unrelated).data.credential).toBe('secret');
    await purgeAccountResults(client,actor); // Idempotent retry.
    await client.query('DELETE FROM accounts WHERE id=$1',[owner]);await purgeAccountResults(client,owner);
    expect((await client.query('SELECT operation_id FROM operation_results WHERE operation_id=ANY($1::uuid[])',[[id,own,unrelated]])).rowCount).toBe(0);
    await client.query('ROLLBACK');
  }finally{await client.query('ROLLBACK');client.release();}
});
it('keeps historical authorization after resource removal and anonymizes a deleted requester',async()=>{
  const owner=await host.verifiedAccount(),other=await host.verifiedAccount(),id=randomUUID(),deletedRequester=randomUUID();
  await host.pool.query(`INSERT INTO operation_results(requester_id,operation_type,operation_id,historical_owner_id,request_hash,state,outcome,confirmed_at,data) VALUES($1,'purgePattern',$2,$3,'test','resolved','success',clock_timestamp(),$4::jsonb)`,[deletedRequester,id,owner.accountId,JSON.stringify({patternId:randomUUID(),credential:'must-not-leak',email:'old@example.invalid'})]);
  const path=`/operations/${id}?operationType=purgePattern`,r=await host.request('GET',path,undefined,owner.session);expect(r.status).toBe(200);expect(DTO.OperationView.parse(r.body)).toMatchObject({actorLabel:'Cuenta eliminada',outcome:'success'});expect(JSON.stringify(r.body)).not.toMatch(/must-not-leak|old@example/);
  expect((await host.request('GET',path,undefined,other.session)).status).toBe(404);expect((await host.request('GET',`/operations/${randomUUID()}?operationType=purgePattern`,undefined,owner.session)).body.code).toBe('OPERATION_RESULT_UNAVAILABLE');
});
it('serializes concurrent removal of both identities without leaving orphan evidence',async()=>{
  const ids=[randomUUID(),randomUUID()],operationId=randomUUID();
  for(const id of ids)await host.pool.query("INSERT INTO accounts(id,email,password_hash,status,verified_at) VALUES($1,$2,'fixture','active',clock_timestamp())",[id,`${id}@example.invalid`]);
  await host.pool.query("INSERT INTO operation_results(requester_id,operation_type,operation_id,historical_owner_id,request_hash,state,outcome,confirmed_at,data) VALUES($1,'purgePattern',$2,$3,'opaque','resolved','success',clock_timestamp(),'{}')",[ids[0],operationId,ids[1]]);
  const clients=await Promise.all([host.pool.connect(),host.pool.connect()]);
  try{
    for(const [i,client] of clients.entries()){await client.query('BEGIN');await client.query('DELETE FROM accounts WHERE id=$1',[ids[i]]);}
    const results=await Promise.all(clients.map(async(client,i)=>{
      try{await purgeAccountResults(client,ids[i]!);await client.query('COMMIT');return true;}
      catch(error){await client.query('ROLLBACK');expect((error as {code?:string}).code).toBe('40P01');return false;}
    }));
    for(const [i,success] of results.entries())if(!success){const client=clients[i]!;await client.query('BEGIN');await client.query('DELETE FROM accounts WHERE id=$1',[ids[i]]);await purgeAccountResults(client,ids[i]!);await client.query('COMMIT');}
    expect((await host.pool.query('SELECT operation_id FROM operation_results WHERE operation_id=$1',[operationId])).rowCount).toBe(0);
  }finally{for(const client of clients){await client.query('ROLLBACK');client.release();}}
});
