import { beforeAll,afterAll,afterEach,it,expect,vi } from 'vitest';
import { randomUUID,createHash } from 'node:crypto';
import { startAccountHost } from '../support/account-host.js';
import type { AccountHost } from '../support/account-host.js';
import { manifestDigest } from '../../apps/api/src/publications/staging.service.js';
import { revisionId } from '../../packages/document/src/revision.js';
import type { HttpDto } from '../../packages/contracts/src/http-dto.js';
import { readFile } from 'node:fs/promises';
import { renderPreview } from '../../packages/print/src/preview.js';
let host:AccountHost;
beforeAll(async()=>{host=await startAccountHost();},30000);afterAll(async()=>{await host?.close();});
afterEach(()=>vi.restoreAllMocks());
const hash=(v:Uint8Array)=>createHash('sha256').update(v).digest('hex');
it.each(['before-write','after-write','verification'] as const)('does not acknowledge upload after %s failure and retries the same identity safely',async fault=>{
  const a=await host.verifiedAccount(),project=await host.request('POST','/projects',{operationId:randomUUID(),name:'Upload faults'},a.session),{m,editable}=content();
  const begin=await host.request('POST','/publications',{operationId:randomUUID(),projectId:project.body.id,patternName:'P',manifest:m},a.session);
  const id=begin.body.publicationId as string,file=m.files[0]!,url=`/publications/${id}/files/${file.fileId}`;
  const put=host.blobs.putStream.bind(host.blobs);
  if(fault==='verification')vi.spyOn(host.blobs,'open').mockImplementationOnce(async function*(){yield Buffer.from('corrupt read');});
  else vi.spyOn(host.blobs,'putStream').mockImplementationOnce(async(key,source,expected)=>{if(fault==='after-write')await put(key,source,expected);throw Error('Injected storage failure');});
  const failed=await host.uploadFile(url,editable,a.session,{'x-content-sha256':hash(editable)});expect(failed.status).toBeGreaterThanOrEqual(400);await failed.arrayBuffer();
  const row=await host.pool.query('SELECT upload_state FROM publication_files WHERE publication_id=$1 AND file_id=$2',[id,file.fileId]);expect(row.rows[0].upload_state).toBe('pending');
  expect((await host.pool.query('SELECT count(*) FROM versions v JOIN patterns p ON p.id=v.pattern_id WHERE p.owner_id=$1',[a.accountId])).rows[0].count).toBe('0');
  const retry=await host.uploadFile(url,editable,a.session,{'x-content-sha256':hash(editable)});expect(retry.status).toBe(200);await retry.arrayBuffer();
  expect(Number((await host.accountRow(a.accountId)).reserved_bytes)).toBe(m.files.reduce((n,f)=>n+f.bytes,0));
});
it('rejects wrong body/hash and cleans only confirmed abandoned blobs',async()=>{
  const a=await host.verifiedAccount(),project=await host.request('POST','/projects',{operationId:randomUUID(),name:'Cleanup'},a.session),{m,editable}=content();
  const begin=await host.request('POST','/publications',{operationId:randomUUID(),projectId:project.body.id,patternName:'P',manifest:m},a.session);
  const id=begin.body.publicationId as string,file=m.files[0]!,url=`/publications/${id}/files/${file.fileId}`;
  const bad=await host.uploadFile(url,Buffer.from('incorrect'),a.session,{'x-content-sha256':hash(editable)});expect(bad.status).toBe(400);await bad.arrayBuffer();
  const good=await host.uploadFile(url,editable,a.session,{'x-content-sha256':hash(editable)});expect(good.status).toBe(200);await good.arrayBuffer();
  const key=(await host.pool.query('SELECT private_key FROM publication_files WHERE publication_id=$1 AND file_id=$2',[id,file.fileId])).rows[0].private_key as string;
  await host.finishPublications();expect(Buffer.from(await host.blobs.get(key))).toEqual(editable);
  const abandoned=await host.request('POST',`/publications/${id}/abandon`,{operationId:randomUUID()},a.session);expect(abandoned.body.outcome).toBe('success');
  await host.finishPublications();await expect(host.blobs.get(key)).rejects.toThrow();
  expect(Number((await host.accountRow(a.accountId)).reserved_bytes)).toBe(0);
});
it('accepts an exact 100 MB manifest boundary and rejects one byte over without reserving quota',async()=>{
  const a=await host.verifiedAccount(),project=await host.request('POST','/projects',{operationId:randomUUID(),name:'Boundary'},a.session),{m}=content();
  m.files[0]!.bytes=100000000;m.manifestHash=manifestDigest(m);
  const good=await host.request('POST','/publications',{operationId:randomUUID(),projectId:project.body.id,patternName:'Inclusive',manifest:m},a.session);expect(good.status).toBe(201);
  const reserved=Number((await host.accountRow(a.accountId)).reserved_bytes);
  m.files[0]!.bytes=100000001;m.manifestHash=manifestDigest(m);
  const bad=await host.request('POST','/publications',{operationId:randomUUID(),projectId:project.body.id,patternName:'Too large',manifest:m},a.session);expect(bad.status).toBeGreaterThanOrEqual(400);
  expect(Number((await host.accountRow(a.accountId)).reserved_bytes)).toBe(reserved);
});
it('keeps complete quota for all versions when a pattern enters the trash',async()=>{
  const a=await host.verifiedAccount(),project=await host.request('POST','/projects',{operationId:randomUUID(),name:'Version quota'},a.session);
  const first=await stage(a.session,project.body.id);await host.queuePublication(a.session,first.id,first.input);await host.finishPublications();
  const committed=(await host.request('POST',`/publications/${first.id}/commit`,first.input,a.session)).body;
  const data=committed.data as {patternId:string;versionId:string};
  const second=await stage(a.session,project.body.id,{patternId:data.patternId,expectedVersionId:data.versionId});await host.queuePublication(a.session,second.id,second.input);await host.finishPublications();
  const final=await host.request('POST',`/publications/${second.id}/commit`,second.input,a.session);
  // Treat the first final response as lost: replay cannot create another version.
  const replay=await host.request('POST',`/publications/${second.id}/commit`,second.input,a.session);expect(replay.body).toEqual(final.body);
  const total=await host.pool.query('SELECT count(DISTINCT v.id) AS versions,sum(f.bytes) AS bytes FROM versions v JOIN stored_files f ON f.version_id=v.id WHERE v.pattern_id=$1',[data.patternId]);
  expect(total.rows[0].versions).toBe('2');expect(Number((await host.accountRow(a.accountId)).used_bytes)).toBe(Number(total.rows[0].bytes));
  const scope=await host.request('GET',`/destructive-scope?kind=pattern&id=${data.patternId}&action=trash`,undefined,a.session);
  const trash=await host.request('POST',`/patterns/${data.patternId}/trash`,{operationId:randomUUID(),scopeRevision:scope.body.scopeRevision,confirmation:true},a.session);expect(trash.body.outcome).toBe('success');
  expect(Number((await host.accountRow(a.accountId)).used_bytes)).toBe(Number(total.rows[0].bytes));
});
it('rolls back upload metadata after a database failure without losing the retriable object',async()=>{
  const a=await host.verifiedAccount(),project=await host.request('POST','/projects',{operationId:randomUUID(),name:'Metadata fault'},a.session),{m,editable}=content();
  const begin=await host.request('POST','/publications',{operationId:randomUUID(),projectId:project.body.id,patternName:'P',manifest:m},a.session);
  const id=begin.body.publicationId as string,file=m.files[0]!,url=`/publications/${id}/files/${file.fileId}`;
  await host.pool.query("CREATE FUNCTION fail_upload_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Injected upload metadata failure'; END $$; CREATE TRIGGER fail_upload_test BEFORE UPDATE OF upload_state ON publication_files FOR EACH ROW EXECUTE FUNCTION fail_upload_test()");
  try{
    const reply=await host.uploadFile(url,editable,a.session,{'x-content-sha256':hash(editable)});expect(reply.status).toBe(500);await reply.arrayBuffer();
    expect((await host.pool.query('SELECT upload_state FROM publication_files WHERE publication_id=$1 AND file_id=$2',[id,file.fileId])).rows[0].upload_state).toBe('pending');
  }finally{await host.pool.query('DROP TRIGGER fail_upload_test ON publication_files; DROP FUNCTION fail_upload_test()');}
  const retry=await host.uploadFile(url,editable,a.session,{'x-content-sha256':hash(editable)});expect(retry.status).toBe(200);await retry.arrayBuffer();
});
function content(){const d={formatVersion:1 as const,documentId:randomUUID(),revisionId:'0'.repeat(64),units:'mm' as const,pieces:[],preparations:[]};d.revisionId=revisionId(d);const editable=Buffer.from(JSON.stringify(d)),preview=Buffer.from([137,80,78,71,13,10,26,10]);
  const m:HttpDto<'BeginPublication'>['manifest']={documentId:d.documentId,localRevisionId:d.revisionId,manifestHash:'0'.repeat(64),files:[{fileId:randomUUID(),role:'editable',originalName:'local.patron',mediaType:'application/json',bytes:editable.length,sha256:hash(editable)},{fileId:randomUUID(),role:'preview',originalName:'preview.png',mediaType:'image/png',bytes:preview.length,sha256:hash(preview),exportProfileId:'patronaje-preview-1'}]};m.manifestHash=manifestDigest(m);return {m,editable,preview};}
it('reserves once, uploads exact bytes idempotently and does not publish an unverified PNG',async()=>{
  const a=await host.verifiedAccount(),project=await host.request('POST','/projects',{operationId:randomUUID(),name:'P'},a.session),{m,editable}=content();
  const input={operationId:randomUUID(),projectId:project.body.id,patternName:'Patrón',manifest:m},first=await host.request('POST','/publications',input,a.session);expect(first.status).toBe(201);
  expect((await host.request('POST','/publications',input,a.session)).body).toEqual(first.body);
  const quota=await host.accountRow(a.accountId);expect(Number(quota.reserved_bytes)).toBe(m.files.reduce((s,f)=>s+f.bytes,0));
  const url=`/publications/${first.body.publicationId}/files/${m.files[0]!.fileId}`;
  const upload=()=>host.uploadFile(url,editable,a.session,{'content-type':'application/json','x-content-sha256':hash(editable)});
  expect((await upload()).status).toBe(200);expect((await upload()).status).toBe(200);
  const state=await host.request('GET',`/publications/${first.body.publicationId}`,undefined,a.session);expect(state.body.state).toBe('staging');expect(JSON.stringify(state.body)).not.toContain('private_key');expect((await host.pool.query('SELECT count(*) FROM versions v JOIN patterns p ON p.id=v.pattern_id WHERE p.owner_id=$1',[a.accountId])).rows[0].count).toBe('0');
});
it('serializes concurrent reservations and preserves terminal quota rejection',async()=>{
  const a=await host.verifiedAccount(),project=await host.request('POST','/projects',{operationId:randomUUID(),name:'P'},a.session),{m}=content();
  const bytes=m.files.reduce((s,f)=>s+f.bytes,0);await host.pool.query('UPDATE accounts SET used_bytes=$2 WHERE id=$1',[a.accountId,2000000000-bytes]);
  const input={operationId:randomUUID(),projectId:project.body.id,patternName:'P',manifest:m};
  const other={...input,operationId:randomUUID()};const results=await Promise.all([host.request('POST','/publications',input,a.session),host.request('POST','/publications',other,a.session)]);
  expect(results.map(r=>r.status).sort()).toEqual([201,409]);
  expect(results.find(r=>r.status===409)!.body.quota).toMatchObject({requestedBytes:bytes,limitBytes:2000000000});
  const failed=results[0]!.status===409?input:other;await host.pool.query('UPDATE accounts SET used_bytes=0 WHERE id=$1',[a.accountId]);expect((await host.request('POST','/publications',failed,a.session)).status).toBe(409);
});
it('releases abandoned staging exactly once and refuses abandonment of an unresolved commit',async()=>{
  const a=await host.verifiedAccount(),project=await host.request('POST','/projects',{operationId:randomUUID(),name:'Abandon'},a.session),{m}=content();
  const begin=await host.request('POST','/publications',{operationId:randomUUID(),projectId:project.body.id,patternName:'Abandonado',manifest:m},a.session),input={operationId:randomUUID()},path=`/publications/${begin.body.publicationId}/abandon`;
  const first=await host.request('POST',path,input,a.session);expect(first.body.outcome).toBe('success');expect((await host.request('POST',path,input,a.session)).body).toEqual(first.body);expect(Number((await host.accountRow(a.accountId)).reserved_bytes)).toBe(0);
  const p=await stage(a.session,project.body.id);await host.queuePublication(a.session,p.id,p.input);
  const refused=await host.request('POST',`/publications/${p.id}/abandon`,{operationId:randomUUID()},a.session);expect(refused.body).toMatchObject({outcome:'failure',data:{code:'OPERATION_PENDING'}});expect(Number((await host.accountRow(a.accountId)).reserved_bytes)).toBeGreaterThan(0);
  await host.finishPublications();
});
it('verifies the PNG in isolation and commits the whole version exactly once',async()=>{
  const a=await host.verifiedAccount(),project=await host.request('POST','/projects',{operationId:randomUUID(),name:'Publicable'},a.session),{m,editable}=content();
  const preview=Buffer.from((await renderPreview(JSON.parse(editable.toString()),{wasm:await readFile('node_modules/@resvg/resvg-wasm/index_bg.wasm'),font:await readFile('.local/assets/NotoSans-Regular.ttf')})).bytes);
  m.files[1]!.bytes=preview.length;m.files[1]!.sha256=hash(preview);m.manifestHash=manifestDigest(m);
  const begin=await host.request('POST','/publications',{operationId:randomUUID(),projectId:project.body.id,patternName:'Publicado',manifest:m},a.session);expect(begin.status).toBe(201);
  for(const [i,bytes] of [editable,preview].entries())expect((await host.uploadFile(`/publications/${begin.body.publicationId}/files/${m.files[i]!.fileId}`,bytes,a.session,{'content-type':m.files[i]!.mediaType,'x-content-sha256':hash(bytes)})).status).toBe(200);
  const input={operationId:randomUUID(),manifestHash:m.manifestHash},path=`/publications/${begin.body.publicationId}/commit`;
  expect((await host.request('POST',path,input,a.session)).status).toBe(202);await host.finishPublications();
  const result=await host.request('POST',path,input,a.session);expect(result.body.outcome).toBe('success');
  const versions=await host.pool.query('SELECT v.* FROM versions v JOIN patterns p ON p.id=v.pattern_id WHERE p.owner_id=$1',[a.accountId]);expect(versions.rowCount).toBe(1);
  expect((await host.pool.query('SELECT count(*) FROM stored_files WHERE version_id=$1',[versions.rows[0].id])).rows[0].count).toBe('2');
  const quota=await host.accountRow(a.accountId);expect(Number(quota.used_bytes)).toBe(editable.length+preview.length);expect(Number(quota.reserved_bytes)).toBe(0);
  const status=await host.request('GET',`/operations/${input.operationId}?operationType=commitPublication`,undefined,a.session);expect(status.body.outcome).toBe('success');expect(JSON.stringify(status.body)).not.toContain('private_key');
  const stranger=await host.verifiedAccount();expect((await host.request('GET',`/operations/${input.operationId}?operationType=commitPublication`,undefined,stranger.session)).status).toBe(404);
});
it('rejects an uploaded PNG that is not the reproducible preview without exposing a partial pattern',async()=>{
  const a=await host.verifiedAccount(),project=await host.request('POST','/projects',{operationId:randomUUID(),name:'Invalid'},a.session),{m,editable,preview}=content();
  const begin=await host.request('POST','/publications',{operationId:randomUUID(),projectId:project.body.id,patternName:'No visible',manifest:m},a.session);
  for(const [i,bytes] of [editable,preview].entries())expect((await host.uploadFile(`/publications/${begin.body.publicationId}/files/${m.files[i]!.fileId}`,bytes,a.session,{'content-type':m.files[i]!.mediaType,'x-content-sha256':hash(bytes)})).status).toBe(200);
  const input={operationId:randomUUID(),manifestHash:m.manifestHash},path=`/publications/${begin.body.publicationId}/commit`;await host.request('POST',path,input,a.session);await host.finishPublications();
  const result=await host.request('POST',path,input,a.session);expect(result.body).toMatchObject({outcome:'failure',data:{code:'ARTIFACT_MISMATCH'}});
  expect((await host.pool.query('SELECT count(*) FROM patterns WHERE owner_id=$1',[a.accountId])).rows[0].count).toBe('0');expect(Number((await host.accountRow(a.accountId)).used_bytes)).toBe(0);
});
async function stage(session:Awaited<ReturnType<AccountHost['login']>>,projectId:unknown,previous?:{patternId:string;expectedVersionId:string}){
  const {m,editable}=content(),preview=Buffer.from((await renderPreview(JSON.parse(editable.toString()),{wasm:await readFile('node_modules/@resvg/resvg-wasm/index_bg.wasm'),font:await readFile('.local/assets/NotoSans-Regular.ttf')})).bytes);
  m.files[1]!.bytes=preview.length;m.files[1]!.sha256=hash(preview);m.manifestHash=manifestDigest(m);
  const begin=await host.request('POST','/publications',{operationId:randomUUID(),projectId,...previous??{patternName:'Prueba'},manifest:m},session);expect(begin.status).toBe(201);
  for(const [i,bytes] of [editable,preview].entries())expect((await host.uploadFile(`/publications/${begin.body.publicationId}/files/${m.files[i]!.fileId}`,bytes,session,{'content-type':m.files[i]!.mediaType,'x-content-sha256':hash(bytes)})).status).toBe(200);
  return {id:begin.body.publicationId as string,input:{operationId:randomUUID(),manifestHash:m.manifestHash}};
}
it('revalidates the session after artifact verification and preserves an expired attempt as failure',async()=>{
  const a=await host.verifiedAccount(),project=await host.request('POST','/projects',{operationId:randomUUID(),name:'Revoked'},a.session),p=await stage(a.session,project.body.id);
  await host.queuePublication(a.session,p.id,p.input);
  await host.pool.query('UPDATE sessions SET revoked_at=clock_timestamp() WHERE id=$1',[a.session.view.id]);await host.finishPublications();
  const op=(await host.pool.query('SELECT outcome,data FROM operation_results WHERE operation_id=$1',[p.input.operationId])).rows[0];expect(op).toMatchObject({outcome:'failure',data:{code:'SESSION_REVOKED'}});
  expect((await host.pool.query('SELECT count(*) FROM patterns WHERE owner_id=$1',[a.accountId])).rows[0].count).toBe('0');
});
it('allows only one competing update of the expected version and retains the previous version',async()=>{
  const a=await host.verifiedAccount(),project=await host.request('POST','/projects',{operationId:randomUUID(),name:'Versions'},a.session),first=await stage(a.session,project.body.id);
  await host.queuePublication(a.session,first.id,first.input);await host.finishPublications();
  const data=(await host.pool.query('SELECT data FROM operation_results WHERE operation_id=$1',[first.input.operationId])).rows[0].data;
  const prev={patternId:data.patternId as string,expectedVersionId:data.versionId as string},p=await stage(a.session,project.body.id,prev),q=await stage(a.session,project.body.id,prev);
  await Promise.all([host.queuePublication(a.session,p.id,p.input),host.queuePublication(a.session,q.id,q.input)]);await host.finishPublications();
  const outcomes=(await host.pool.query('SELECT outcome,data FROM operation_results WHERE operation_id=ANY($1::uuid[])',[[p.input.operationId,q.input.operationId]])).rows;
  expect(outcomes.map(r=>r.outcome).sort()).toEqual(['failure','success']);expect(outcomes.find(r=>r.outcome==='failure')!.data.code).toBe('VERSION_CONFLICT');
  expect((await host.pool.query('SELECT count(*) FROM versions WHERE pattern_id=$1',[prev.patternId])).rows[0].count).toBe('2');expect((await host.pool.query('SELECT count(*) FROM stored_files WHERE version_id=$1',[prev.expectedVersionId])).rows[0].count).toBe('2');
});
it('rolls back a database failure after file insertion and safely resumes the same pending commit',async()=>{
  const a=await host.verifiedAccount(),project=await host.request('POST','/projects',{operationId:randomUUID(),name:'Rollback'},a.session),p=await stage(a.session,project.body.id);
  await host.queuePublication(a.session,p.id,p.input);
  await host.pool.query(`CREATE FUNCTION fail_test_commit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Injected commit failure'; END $$; CREATE TRIGGER fail_test_commit BEFORE UPDATE OF latest_version_id ON patterns FOR EACH ROW EXECUTE FUNCTION fail_test_commit()`);
  try {
    await expect(host.finishPublications()).rejects.toThrow('Injected commit failure');
    expect((await host.pool.query('SELECT count(*) FROM patterns WHERE owner_id=$1',[a.accountId])).rows[0].count).toBe('0');
    expect((await host.pool.query('SELECT count(*) FROM versions WHERE publication_id=$1',[p.id])).rows[0].count).toBe('0');
    expect((await host.pool.query('SELECT state FROM operation_results WHERE operation_id=$1',[p.input.operationId])).rows[0].state).toBe('pending');
    expect(Number((await host.accountRow(a.accountId)).used_bytes)).toBe(0);
  }finally{await host.pool.query('DROP TRIGGER fail_test_commit ON patterns; DROP FUNCTION fail_test_commit()');}
  await host.finishPublications();const result=await host.request('POST',`/publications/${p.id}/commit`,p.input,a.session);expect(result.body.outcome).toBe('success');
  const data=result.body.data as {versionId:string;files:unknown[]};expect(data.files).toHaveLength(2);
  await expect(host.pool.query('UPDATE versions SET ordinal=ordinal+1 WHERE id=$1',[data.versionId])).rejects.toThrow('Immutable published content');
  await expect(host.pool.query("UPDATE stored_files SET original_name='changed' WHERE version_id=$1",[data.versionId])).rejects.toThrow('Immutable published content');
});
