import {it,expect} from 'vitest';
import {randomUUID,createHash} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {spawn} from 'node:child_process';
import {postgresCluster} from '../support/postgres-cluster.js';
import {migrate} from '../../apps/api/src/db/migrate.js';
import {PostgresBackup,verifyBackupObject} from '../../apps/api/src/storage/postgres-backup.js';
import {runBackup,runIsolatedRestore} from '../../apps/api/src/storage/backup-coordinator.js';
import {LocalBackupStore} from '../../apps/api/src/storage/local-backup-store.js';
import {LocalSuppressionLog} from '../../apps/api/src/storage/suppression-log.js';
import {applyRestoredSuppressions} from '../../apps/api/src/storage/restore-suppressions.js';
import {LocalBlobStore} from '../../apps/api/src/storage/blob-store.js';
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
function command(script:string,args:string[],env:Partial<NodeJS.ProcessEnv>){return new Promise<{code:number|null;stdout:string}>(resolve=>{const child=spawn(process.execPath,[script,...args],{env:{...process.env,...env},windowsHide:true,stdio:['ignore','pipe','pipe']});let stdout='';child.stdout.on('data',b=>{stdout+=b;});child.stderr.resume();child.on('close',code=>resolve({code,stdout}));});}
it('T091/T092 local scripts reject a live source, then back up and restore real PostgreSQL',async()=>{
 const root=await mkdtemp(join(tmpdir(),'patron-pg-cli-')),source=await postgresCluster('source_admin');let target:Awaited<ReturnType<typeof postgresCluster>>|undefined;
 try{
  await migrate(source.pool,resolve('apps/api/src/db/migrations'));const id=randomUUID();
  await source.pool.query("INSERT INTO accounts(id,email,password_hash,status) VALUES($1,'cli@example.invalid','synthetic','active')",[id]);
  const args=['--directory',join(root,'backups'),'--journal',join(root,'journal')];
  expect((await command('tools/operations/backup.mjs',args,source.environment)).code).toBe(1);
  expect((await source.pool.query('SELECT datconnlimit FROM pg_database WHERE datname=current_database()')).rows[0].datconnlimit).toBe(-1);
  await source.pool.end();const backed=await command('tools/operations/backup.mjs',args,source.environment);expect(backed.code).toBe(0);const receipt=JSON.parse(backed.stdout);
  target=await postgresCluster('restore_admin');const restored=await command('tools/operations/restore.mjs',[...args,'--blobs',join(root,'blobs'),'--id',receipt.backupId],target.environment);
  expect(restored.code).toBe(0);expect(JSON.parse(restored.stdout).state).toBe('isolated-ready');
  expect((await target.pool.query('SELECT id FROM accounts')).rows).toEqual([{id}]);
  expect((await target.pool.query('SELECT datconnlimit FROM pg_database WHERE datname=current_database()')).rows[0].datconnlimit).toBe(-1);
 }finally{await target?.close();await source.close();await rm(root,{recursive:true,force:true});}
},120000);
it('T091/T092 restores a real custom archive and roles, applies later suppressions and keeps workers isolated',async()=>{
 const root=await mkdtemp(join(tmpdir(),'patron-pg-backup-')),source=await postgresCluster('source_admin');let target:Awaited<ReturnType<typeof postgresCluster>>|undefined;
 try{
  await migrate(source.pool,resolve('apps/api/src/db/migrations'));
  await source.pool.query('CREATE ROLE patron_reader NOLOGIN');await source.pool.query('GRANT SELECT ON projects TO patron_reader');
  const owner=randomUUID(),deletedOwner=randomUUID(),project=randomUUID(),deletedProject=randomUUID(),publication=randomUUID(),token=randomUUID();
  for(const id of [owner,deletedOwner])await source.pool.query("INSERT INTO accounts(id,email,password_hash,status,verified_at) VALUES($1,$2,'synthetic','active',clock_timestamp())",[id,id+'@example.invalid']);
  await source.pool.query("INSERT INTO projects(id,owner_id,name) VALUES($1,$2,'Keep'),($3,$4,'Remove')",[project,owner,deletedProject,deletedOwner]);
  await source.pool.query("INSERT INTO publications(id,owner_id,project_id,pattern_name,document_id,local_revision_id,manifest,manifest_hash,reservation_bytes) VALUES($1,$2,$3,'Pending', $4,$5,'{}',$5,6)",[publication,owner,project,randomUUID(),hash('revision')]);
  await source.pool.query("INSERT INTO publication_files(publication_id,file_id,role,original_name,media_type,bytes,sha256,private_key,upload_state,received_at) VALUES($1,$2,'editable','file.patron','application/json',6,$3,$4,'received',clock_timestamp())",[publication,randomUUID(),hash('active'),'a'.repeat(64)]);
  const deletedPublication=randomUUID(),deletedDocument=randomUUID(),deletedPattern=randomUUID(),deletedVersion=randomUUID(),deletedCommit=randomUUID();
  await source.pool.query("INSERT INTO patterns(id,project_id,owner_id,name) VALUES($1,$2,$3,'Removed')",[deletedPattern,deletedProject,deletedOwner]);
  await source.pool.query("INSERT INTO publications(id,owner_id,project_id,pattern_name,document_id,local_revision_id,manifest,manifest_hash,reservation_bytes,state,committed_at,commit_operation_id) VALUES($1,$2,$3,'Removed', $4,$5,'{}',$5,0,'committed',now(),$6)",[deletedPublication,deletedOwner,deletedProject,deletedDocument,hash('revision'),deletedCommit]);
  await source.pool.query("INSERT INTO publication_files(publication_id,file_id,role,original_name,media_type,bytes,sha256,private_key,upload_state,received_at) VALUES($1,$2,'editable','removed.patron','application/json',7,$3,$4,'received',clock_timestamp())",[deletedPublication,randomUUID(),hash('removed'),'b'.repeat(64)]);
  await source.pool.query('INSERT INTO versions(id,pattern_id,ordinal,author_id,document_id,local_revision_id,publication_id,commit_operation_id) VALUES($1,$2,1,$3,$4,$5,$6,$7)',[deletedVersion,deletedPattern,deletedOwner,deletedDocument,hash('revision'),deletedPublication,deletedCommit]);
  await source.pool.query('UPDATE patterns SET latest_version_id=$2 WHERE id=$1',[deletedPattern,deletedVersion]);
  await source.pool.query("INSERT INTO stored_files(id,version_id,role,original_name,media_type,bytes,sha256,private_key,document_id,local_revision_id) VALUES($1,$2,'editable','removed.patron','application/json',7,$3,$4,$5,$6)",[randomUUID(),deletedVersion,hash('removed'),'b'.repeat(64),deletedDocument,hash('revision')]);
  await source.pool.query("INSERT INTO one_use_tokens(id,account_id,purpose,token_hash,issued_at,expires_at) VALUES($1,$2,'verify_email',$3,now(),now()+interval '2 hours')",[token,owner,hash('token')]);
  await source.pool.query("INSERT INTO outbox_jobs(id,kind,deduplication_key,account_id,token_id,state,key_id,payload,nonce,auth_tag) VALUES($1,'account_token',$2,$3,$4,'pending','test',$5,$6,$7)",[randomUUID(),randomUUID(),owner,token,Buffer.from('test'),Buffer.alloc(12),Buffer.alloc(16)]);
  const operation=randomUUID();await source.pool.query("INSERT INTO operation_results(requester_id,operation_type,operation_id,historical_owner_id,request_hash,state,outcome,confirmed_at,data) VALUES($1,'updateProfile',$2,$1,'synthetic','resolved','success',now(),'{\"private\":true}')",[deletedOwner,operation]);
  const log=new LocalSuppressionLog(join(root,'suppression')),store=new LocalBackupStore(join(root,'backups')),archive=new PostgresBackup(source.pool,source.run);let registered=false,drained=false;
  const manifest=await runBackup({drain:async()=>{drained=true;return {release:async()=>{drained=false;}};},capture:()=>archive.capture({sequence:0,hash:null}),store:a=>store.store(a),register:async()=>{registered=true;},shutdown:async()=>{throw Error('must not shutdown');}},randomUUID(),'daily');
  expect(registered).toBe(true);expect(drained).toBe(false);const artifact=await store.read(manifest.backupId);expect(Buffer.from(artifact.dump).subarray(0,5).toString()).toBe('PGDMP');expect(artifact.manifest.objects).toHaveLength(2);
  // A post-capture change must not enter the restored snapshot.
  await source.pool.query("UPDATE projects SET name='Later' WHERE id=$1",[project]);
  const intent=randomUUID();await log.append({id:intent,kind:'intent',scope:{kind:'account',resourceIds:[deletedOwner,deletedProject,deletedPattern],objectKeys:['b'.repeat(64)]}});
  const blobs=new LocalBlobStore(join(root,'blobs'));await blobs.put('a'.repeat(64),Buffer.from('active'));
  target=await postgresCluster('restore_admin');const restore=new PostgresBackup(target.pool,target.run);let sealed=false,restores=0;
  const ports={isolate:async()=>({traffic:false,jobs:false,mail:false}),evidence:()=>log.read(),restore:async(a:typeof artifact)=>{restores++;await restore.restore(a);},suppress:(scopes:Parameters<typeof applyRestoredSuppressions>[1])=>applyRestoredSuppressions(target!.pool,scopes),verifyObject:(o:typeof manifest.objects[number])=>verifyBackupObject(o,k=>blobs.open(k)),seal:async()=>{sealed=true;}};
  await expect(runIsolatedRestore(ports,artifact,Date.now())).rejects.toThrow('RESTORE_REQUIRES_RECONCILIATION');expect(restores).toBe(0);expect(sealed).toBe(false);
  await log.append({id:randomUUID(),kind:'confirmed',intentId:intent});
  const preservedEvidence=await log.read();
  await runIsolatedRestore(ports,artifact,Date.now());expect(sealed).toBe(true);
  expect((await target.pool.query('SELECT name FROM projects WHERE id=$1',[project])).rows[0].name).toBe('Keep');
  expect((await target.pool.query('SELECT id FROM accounts WHERE id=$1',[deletedOwner])).rowCount).toBe(0);
  expect((await target.pool.query('SELECT * FROM operation_results WHERE operation_id=$1',[operation])).rowCount).toBe(0);
  expect((await target.pool.query('SELECT id FROM stored_files')).rowCount).toBe(0);expect((await target.pool.query('SELECT id FROM versions')).rowCount).toBe(0);
  expect((await target.pool.query("SELECT has_table_privilege('patron_reader','projects','SELECT') AS allowed")).rows[0].allowed).toBe(true);
  expect((await target.pool.query('SELECT attempts,state FROM outbox_jobs')).rows).toEqual([{attempts:0,state:'pending'}]);
  expect((await target.pool.query('SELECT state FROM publications')).rows).toEqual([{state:'staging'}]);
  await expect(restore.restore(artifact)).rejects.toThrow('RESTORE_TARGET_NOT_EMPTY');
  expect((await source.pool.query('SELECT id FROM accounts WHERE id=$1',[deletedOwner])).rowCount).toBe(1);
  await target.close();target=undefined;target=await postgresCluster('restore_admin');sealed=false;
  const missingRestore=new PostgresBackup(target.pool,target.run);await blobs.remove('a'.repeat(64));
  await expect(runIsolatedRestore({...ports,restore:a=>missingRestore.restore(a)},artifact,Date.now())).rejects.toThrow();
  expect(sealed).toBe(false);expect((await target.pool.query('SELECT id FROM accounts WHERE id=$1',[deletedOwner])).rowCount).toBe(0);
  expect(await log.read()).toEqual(preservedEvidence);
 }finally{await target?.close();await source.close();await rm(root,{recursive:true,force:true});}
},120000);

