import { beforeAll,afterAll,it,expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { startAccountHost } from '../support/account-host.js';
import type { AccountHost } from '../support/account-host.js';
let host:AccountHost;
beforeAll(async()=>{host=await startAccountHost();},30000);afterAll(async()=>{await host?.close();});
it('enforces project ownership and immutable declared publication input',async()=>{
  const a=await host.verifiedAccount(),b=await host.verifiedAccount(),project=randomUUID(),publication=randomUUID();
  await host.pool.query('INSERT INTO projects(id,owner_id,name) VALUES($1,$2,$3)',[project,a.accountId,'P']);
  await expect(host.pool.query('INSERT INTO patterns(id,project_id,owner_id,name) VALUES($1,$2,$3,$4)',[randomUUID(),project,b.accountId,'Wrong'])).rejects.toThrow();
  await host.pool.query(`INSERT INTO publications(id,owner_id,project_id,pattern_name,document_id,local_revision_id,manifest,manifest_hash,reservation_bytes) VALUES($1,$2,$3,'New',$4,$5,'{}',$5,20)`,[publication,a.accountId,project,randomUUID(),'a'.repeat(64)]);
  await expect(host.pool.query("UPDATE publications SET manifest='[]' WHERE id=$1",[publication])).rejects.toThrow('Immutable publication input');
  const file=randomUUID();await host.pool.query(`INSERT INTO publication_files(publication_id,file_id,role,original_name,media_type,bytes,sha256,private_key) VALUES($1,$2,'editable','a.patron','application/json',10,$3,$4)`,[publication,file,'a'.repeat(64),randomUUID()]);
  await expect(host.pool.query('UPDATE publication_files SET bytes=11 WHERE publication_id=$1',[publication])).rejects.toThrow('Immutable declared file');
  await host.pool.query("UPDATE publication_files SET upload_state='received',received_at=clock_timestamp() WHERE publication_id=$1",[publication]);
  await expect(host.pool.query("UPDATE publication_files SET upload_state='pending',received_at=NULL WHERE publication_id=$1",[publication])).rejects.toThrow();
});
it('rejects missing PDF provenance and a new publication without a pattern name',async()=>{
  const a=await host.verifiedAccount(),project=randomUUID();await host.pool.query('INSERT INTO projects(id,owner_id,name) VALUES($1,$2,$3)',[project,a.accountId,'P']);
  await expect(host.pool.query(`INSERT INTO publications(id,owner_id,project_id,document_id,local_revision_id,manifest,manifest_hash,reservation_bytes) VALUES($1,$2,$3,$4,$5,'{}',$5,0)`,[randomUUID(),a.accountId,project,randomUUID(),'a'.repeat(64)])).rejects.toThrow();
});
