import {createHash} from 'node:crypto';
import type {Pool} from 'pg';
import type {BackupArtifact,BackupCapture,BackupObject} from './backup-coordinator.js';
import {validateBackup} from './backup-coordinator.js';
export type PgTool='pg_dump'|'pg_dumpall'|'pg_restore'|'psql';
/** Connection configuration belongs to the operator, never command-line input
 * from an API client. Implementations must not log stdout, stderr or secrets. */
export type PgRunner=(tool:PgTool,args:string[],input?:Uint8Array)=>Promise<Uint8Array>;
export class PostgresBackup {
 constructor(private readonly pool:Pool,private readonly run:PgRunner,private readonly schemaName='public'){
  if(!/^[a-z][a-z0-9_]*$/.test(schemaName))throw Error('BACKUP_SCHEMA_INVALID');
 }
 async capture(watermark:BackupCapture['watermark']):Promise<BackupCapture>{
  const client=await this.pool.connect();
  try{
   await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
   await client.query(`SET LOCAL search_path TO "${this.schemaName}"`);
   const snapshot=(await client.query<{snapshot:string;engine:string;now:string}>("SELECT pg_export_snapshot() AS snapshot,current_setting('server_version') AS engine,(extract(epoch FROM clock_timestamp())*1000)::bigint::text AS now")).rows[0]!;
   const migrations=(await client.query('SELECT name,sha256 FROM schema_migrations ORDER BY name')).rows;
   const objects=(await client.query<{key:string;sha256:string;bytes:string}>("SELECT private_key AS key,sha256,bytes::text FROM stored_files UNION SELECT private_key,sha256,bytes::text FROM publication_files WHERE upload_state='received' ORDER BY key")).rows.map(r=>({...r,bytes:Number(r.bytes)}));
   // pg_dump imports precisely the metadata transaction's snapshot.
   const dump=await this.run('pg_dump',['--format=custom',`--snapshot=${snapshot.snapshot}`,`--schema=${this.schemaName}`]);
   const roles=await this.run('pg_dumpall',['--roles-only']);
   await client.query('COMMIT');
   return {schema:JSON.stringify({name:this.schemaName,migrations}),engine:snapshot.engine,capturedAt:Number(snapshot.now),dump,roles,objects,watermark:{...watermark}};
  }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}finally{client.release();}
 }
 async restore(input:BackupArtifact){
  const artifact=validateBackup(input),schema=JSON.parse(artifact.manifest.schema) as {name:string;migrations:unknown};
  if(schema.name!==this.schemaName||!Array.isArray(schema.migrations))throw Error('BACKUP_SCHEMA_INVALID');
  const existing=await this.pool.query("SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1 AND c.relkind IN ('r','p','v','m','S','f') LIMIT 1",[this.schemaName]);
  if(existing.rowCount)throw Error('RESTORE_TARGET_NOT_EMPTY');
  // Roles are restored on a fresh isolated cluster with a different bootstrap
  // administrator. Any conflict is fatal, never ignored or applied in-place.
  await this.run('psql',['-X','--set=ON_ERROR_STOP=1','--single-transaction','--quiet'],artifact.roles);
  // template0 has an empty public schema. RESTRICT (no CASCADE) refuses any
  // unexpected objects; pg_restore then recreates its recorded owner and ACLs.
  await this.pool.query(`DROP SCHEMA IF EXISTS "${this.schemaName}" RESTRICT`);
  await this.run('pg_restore',['--single-transaction','--exit-on-error'],artifact.dump);
  const client=await this.pool.connect();try{
   await client.query('BEGIN');await client.query(`SET LOCAL search_path TO "${this.schemaName}"`);
   const actual=(await client.query('SELECT name,sha256 FROM schema_migrations ORDER BY name')).rows;
   if(JSON.stringify(actual)!==JSON.stringify(schema.migrations))throw Error('RESTORE_SCHEMA_MISMATCH');
   await client.query('COMMIT');
  }catch(e){await client.query('ROLLBACK').catch(()=>{});throw e;}finally{client.release();}
 }
}
export async function verifyBackupObject(object:BackupObject,open:(key:string)=>AsyncIterable<Uint8Array>){
 let bytes=0;const hash=createHash('sha256');for await(const chunk of open(object.key)){bytes+=chunk.length;if(bytes>object.bytes)throw Error('RESTORE_OBJECT_MISMATCH');hash.update(chunk);}
 if(bytes!==object.bytes||hash.digest('hex')!==object.sha256)throw Error('RESTORE_OBJECT_MISMATCH');
}
