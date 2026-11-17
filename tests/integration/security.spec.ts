import {beforeAll,afterAll,it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {startAccountHost,type AccountHost} from '../support/account-host.js';
let host:AccountHost;
beforeAll(async()=>{host=await startAccountHost();},30000);
afterAll(async()=>{await host?.close();});

it('foreign resource identifiers and scopes do not expose content or authorize mutations',async()=>{
 const owner=await host.verifiedAccount(),other=await host.verifiedAccount();
 const created=await host.request('POST','/projects',{operationId:randomUUID(),name:'Private security fixture'},owner.session);
 expect(created.status).toBe(201);const id=String(created.body.id);
 const scope=await host.request('GET',`/destructive-scope?kind=project&id=${id}&action=trash`,undefined,owner.session);
 expect(scope.status).toBe(200);
 for(const path of [`/projects/${id}`,`/projects/${id}/patterns`,`/destructive-scope?kind=project&id=${id}&action=trash`]){
  const reply=await host.request('GET',path,undefined,other.session);
  expect(reply.status).toBeGreaterThanOrEqual(400);expect(reply.headers.get('cache-control')).toBe('no-store');
  expect(JSON.stringify(reply.body)).not.toContain('Private security fixture');
 }
 const attempted=await host.request('POST',`/projects/${id}/trash`,{operationId:randomUUID(),scopeRevision:scope.body.scopeRevision,confirmation:true},other.session);
 expect(attempted.status>=400||attempted.body.outcome==='failure').toBe(true);
 const actual=await host.request('GET',`/projects/${id}`,undefined,owner.session);
 expect(actual.body.state).toBe('active');
 const list=await host.request('GET','/projects',undefined,other.session);expect(list.body.items).toEqual([]);
});

it('unauthenticated, revoked and forged credentials never return private profile data',async()=>{
 const a=await host.verifiedAccount();
 const valid=await host.request('GET','/account/profile',undefined,a.session);
 expect(valid.status).toBe(200);expect(valid.headers.get('cache-control')).toBe('no-store');
 expect(JSON.stringify(valid.body)).not.toContain(a.session.credential);
 const revoked=await host.request('DELETE','/sessions/current',{operationId:randomUUID()},a.session);
 expect(revoked.status).toBe(200);
 for(const session of [undefined,a.session,{...a.session,credential:`Bearer ${randomUUID()}.${'x'.repeat(43)}`}]){
  const reply=await host.request('GET','/account/profile',undefined,session);
  expect(reply.status).toBe(401);expect(reply.headers.get('cache-control')).toBe('no-store');
  expect(JSON.stringify(reply.body)).not.toContain(a.email);expect(JSON.stringify(reply.body)).not.toContain(a.session.credential);
 }
});
