import { beforeAll,afterAll,it,expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { startAccountHost } from '../support/account-host.js';
import type { AccountHost } from '../support/account-host.js';
let host:AccountHost;
beforeAll(async()=>{host=await startAccountHost();},30000);afterAll(async()=>{await host?.close();});
it('creates own projects idempotently without name uniqueness and rejects foreign access',async()=>{
  const a=await host.verifiedAccount(),b=await host.verifiedAccount(),input={operationId:randomUUID(),name:'Proyecto'};
  const first=await host.request('POST','/projects',input,a.session);expect(first.status).toBe(201);expect(first.body.ownerId).toBe(a.accountId);
  expect((await host.request('POST','/projects',input,a.session)).body).toEqual(first.body);
  expect((await host.request('POST','/projects',{...input,operationId:randomUUID()},a.session)).status).toBe(201);
  expect((await host.request('GET',`/projects/${first.body.id}`,undefined,b.session)).status).toBe(404);
  const list=await host.request('GET','/projects?limit=1',undefined,a.session);expect(list.status).toBe(200);expect((list.body.items as unknown[]).length).toBe(1);
  expect((await host.request('GET',`/projects?cursor=${encodeURIComponent(String(list.body.nextCursor))}`,undefined,b.session)).status).toBe(400);
  const second=await host.request('GET',`/projects?cursor=${encodeURIComponent(String(list.body.nextCursor))}`,undefined,a.session);expect((second.body.items as unknown[]).length).toBe(1);
});
it('renames with revision conflict and checks owner again',async()=>{
  const a=await host.verifiedAccount(),p=await host.request('POST','/projects',{operationId:randomUUID(),name:'Primero'},a.session);
  const input={operationId:randomUUID(),name:'Segundo',expectedResourceRevision:p.body.resourceRevision};
  const renamed=await host.request('PATCH',`/projects/${p.body.id}`,input,a.session);expect(renamed.status).toBe(200);expect(renamed.body.resourceRevision).toBe('2');
  expect((await host.request('PATCH',`/projects/${p.body.id}`,{...input,operationId:randomUUID()},a.session)).status).toBe(409);
  expect((await host.request('GET',`/projects/${p.body.id}/patterns`,undefined,a.session)).body).toEqual({items:[],nextCursor:null});
});
