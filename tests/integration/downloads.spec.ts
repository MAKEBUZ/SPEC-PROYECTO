import { beforeAll,afterAll,afterEach,it,expect,vi } from 'vitest';
import { startAccountHost } from '../support/account-host.js';
import type { AccountHost } from '../support/account-host.js';
import { publishedFixture } from '../support/publication-fixture.js';
import type { Session } from '../support/account-host.js';
import type { LibrarySession } from '../../apps/api/src/library/library.controller.js';
import { randomUUID } from 'node:crypto';
const credential=(s:Session):LibrarySession=>({kind:'session',accountId:s.view.accountId,sessionId:s.view.id,accessClass:'normal',accountStatus:'active',verified:true,expiresAt:Date.parse(s.view.expiresAt),revoked:false});
let host:AccountHost;
beforeAll(async()=>{host=await startAccountHost();},30000);afterAll(async()=>{await host?.close();});
afterEach(()=>vi.restoreAllMocks());
it('lists private immutable versions and serves exact bytes and authorized ranges',async()=>{
  const a=await host.verifiedAccount(),p=await publishedFixture(host,a.session);
  const versions=await host.request('GET',`/patterns/${p.patternId}/versions`,undefined,a.session);expect(versions.status).toBe(200);expect((versions.body.items as unknown[])).toHaveLength(1);
  const list=await host.request('GET',`/versions/${p.versionId}/files`,undefined,a.session);expect(list.status).toBe(200);expect(JSON.stringify(list.body)).not.toContain('private_key');
  const file=(list.body.items as {id:string;role:string;originalName:string}[]).find(f=>f.role==='editable')!;expect(file.originalName).not.toMatch(/[\r\n/\\]/);
  const url=`${host.testBaseUrl}/files/${file.id}/content`,headers={Authorization:a.session.credential};
  const whole=await fetch(url,{headers});expect(whole.status).toBe(200);expect(Buffer.from(await whole.arrayBuffer())).toEqual(p.editable);expect(whole.headers.get('cache-control')).toBe('no-store');expect(whole.headers.get('etag')).toMatch(/^"[a-f0-9]{64}"$/);
  const range=await fetch(url,{headers:{...headers,Range:'bytes=0-9'}});expect(range.status).toBe(206);expect(Buffer.from(await range.arrayBuffer())).toEqual(p.editable.subarray(0,10));expect(range.headers.get('content-range')).toBe(`bytes 0-9/${p.editable.length}`);
  const bad=await fetch(url,{headers:{...headers,Range:'bytes=999999-'}});expect(bad.status).toBe(416);await bad.arrayBuffer();
  const b=await host.verifiedAccount();expect((await fetch(url,{headers:{Authorization:b.session.credential}})).status).toBe(404);
  await host.pool.query('UPDATE sessions SET revoked_at=clock_timestamp() WHERE id=$1',[a.session.view.id]);expect((await fetch(url,{headers:{...headers,Range:'bytes=10-'}})).status).toBe(401);
});
it('rejects private metadata for other owners and trashed resources without opening storage',async()=>{
  const a=await host.verifiedAccount(),b=await host.verifiedAccount(),p=await publishedFixture(host,a.session),file=p.files.find(f=>f.role==='editable')!;
  const storage=vi.spyOn(host.blobs,'open');
  expect((await host.request('GET',`/patterns/${p.patternId}/versions`,undefined,b.session)).status).toBe(404);
  expect((await host.request('GET',`/versions/${p.versionId}/files`,undefined,b.session)).status).toBe(404);
  const scope=await host.request('GET',`/destructive-scope?kind=pattern&id=${p.patternId}&action=trash`,undefined,a.session);
  expect(scope.status).toBe(200);
  const trashed=await host.request('POST',`/patterns/${p.patternId}/trash`,{operationId:randomUUID(),scopeRevision:scope.body.scopeRevision,confirmation:true},a.session);
  expect(trashed.status).toBe(200);
  const r=await fetch(`${host.testBaseUrl}/files/${file.id}/content`,{headers:{Authorization:a.session.credential}});
  expect(r.status).toBeGreaterThanOrEqual(400);await r.arrayBuffer();expect(storage).not.toHaveBeenCalled();
});
it('supports suffix, open-ended and If-Range requests without presenting partial content as complete',async()=>{
  const a=await host.verifiedAccount(),p=await publishedFixture(host,a.session),file=p.files.find(f=>f.role==='editable')!;
  const url=`${host.testBaseUrl}/files/${file.id}/content`,headers={Authorization:a.session.credential};
  for(const [range,start,end] of [['bytes=-10',p.editable.length-10,p.editable.length],['bytes=10-',10,p.editable.length]] as const){
    const r=await fetch(url,{headers:{...headers,Range:range}});expect(r.status).toBe(206);expect(Buffer.from(await r.arrayBuffer())).toEqual(p.editable.subarray(start,end));
  }
  const changed=await fetch(url,{headers:{...headers,Range:'bytes=0-9','If-Range':'"old"'}});
  expect(changed.status).toBe(200);expect(Buffer.from(await changed.arrayBuffer())).toEqual(p.editable);
  const same=await fetch(url,{headers:{...headers,Range:'bytes=0-9','If-Range':`"${file.sha256}"`}});
  expect(same.status).toBe(206);await same.arrayBuffer();
});
it('rejects corruption before headers or private bytes are sent',async()=>{
  const a=await host.verifiedAccount(),p=await publishedFixture(host,a.session),file=p.files.find(f=>f.role==='editable')!;
  vi.spyOn(host.blobs,'open').mockImplementation(async function*(){yield Buffer.alloc(p.editable.length,120);});
  const r=await fetch(`${host.testBaseUrl}/files/${file.id}/content`,{headers:{Authorization:a.session.credential}});
  expect(r.status).toBeGreaterThanOrEqual(400);expect(r.headers.get('content-disposition')).toBeNull();
  expect((await r.json()).code).toBe('ARTIFACT_MISMATCH');
});
it('revalidates the session after storage I/O and rejects new requests after revocation',async()=>{
  const a=await host.verifiedAccount(),p=await publishedFixture(host,a.session),file=p.files.find(f=>f.role==='editable')!;
  const original=host.blobs.open.bind(host.blobs);
  vi.spyOn(host.blobs,'open').mockImplementation(async function*(key,signal){
    yield* original(key,signal);
    await host.pool.query('UPDATE sessions SET revoked_at=clock_timestamp() WHERE id=$1',[a.session.view.id]);
  });
  const r=await fetch(`${host.testBaseUrl}/files/${file.id}/content`,{headers:{Authorization:a.session.credential}});
  expect(r.status).toBe(401);expect(r.headers.get('content-disposition')).toBeNull();await r.arrayBuffer();
});
it('allows an authorized transfer to finish, but reauthorizes every retry and resumption',async()=>{
  const a=await host.verifiedAccount(),p=await publishedFixture(host,a.session,1000000),file=p.files.find(f=>f.role==='editable')!;
  const download=await host.downloads.read(credential(a.session),file.id);
  try {
    const stream=download.stream(),parts:Buffer[]=[];
    for await(const chunk of stream){
      parts.push(Buffer.from(chunk));
      if(parts.length===1)await host.pool.query('UPDATE sessions SET revoked_at=clock_timestamp() WHERE id=$1',[a.session.view.id]);
    }
    expect(Buffer.concat(parts)).toEqual(p.editable);
    expect(parts.length).toBeGreaterThan(1);
    for(const range of [undefined,'bytes=10-']){
      const r=await fetch(`${host.testBaseUrl}/files/${file.id}/content`,{headers:{Authorization:a.session.credential,...(range?{Range:range}:{})}});
      expect(r.status).toBe(401);await r.arrayBuffer();
    }
  }finally{await download.dispose();}
});
