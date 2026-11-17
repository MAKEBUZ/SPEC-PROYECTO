import {randomUUID} from 'node:crypto';
import type {Pool} from 'pg';
import {BackupCatalog,removeLocalBackup,type BackupEntry} from './backup-catalog.js';
import {LocalBackupStore} from './local-backup-store.js';
import {LocalSuppressionLog} from './suppression-log.js';
import {PostgresBackup,type PgRunner} from './postgres-backup.js';
import {runBackup} from './backup-coordinator.js';
import {BackupScheduler} from './backup-scheduler.js';
import {maintenanceFor} from './maintenance-gate.js';
export interface BackupRuntimeOptions {
 pool:Pool;run:PgRunner;directory:string;journal:Pick<LocalSuppressionLog,'read'|'compact'>;
 shutdown():Promise<void>;now?:()=>number;
 drain?:()=>Promise<{release():Promise<void>}>;
 retireCopy?:(entry:BackupEntry)=>Promise<void>;
 onNotice?:(message:string|null)=>void;
 store?:{store:LocalBackupStore['store'];read:LocalBackupStore['read'];remove(id:string):Promise<void>};
}
/** Explicit composition: importing does not schedule backups or stop a host.
 * The API passes its own pool so every writer shares the maintenance gate. */
export function createBackupRuntime(options:BackupRuntimeOptions){
 const catalog=new BackupCatalog(options.directory),store=options.store??new LocalBackupStore(options.directory),archive=new PostgresBackup(options.pool,options.run),now=options.now??Date.now;
 const clean=()=>catalog.clean(now(),async entry=>{if(entry.kind==='backup'){if(options.store)await options.store.remove(entry.id);else await removeLocalBackup(options.directory,entry.id);}else if(options.retireCopy)await options.retireCopy(entry);else throw Error('RESTORE_COPY_RETIREMENT_REQUIRED');});
 const drain=options.drain??(()=>maintenanceFor(options.pool).drain());
 const compact=()=>catalog.withInventory(async copies=>{
  const settled=(await options.pool.query<{suppression_id:string}>("SELECT suppression_id FROM purge_jobs WHERE state='complete'")).rows;
  return options.journal.compact(copies,new Set(settled.map(j=>j.suppression_id)));
 });
 const maintain=async()=>{const lease=await drain();try{await clean();await compact();}finally{await lease.release();}};
 const backup=(reason:'daily'|'shutdown')=>runBackup({
  drain,
  capture:async()=>{const log=await options.journal.read(),last=log.at(-1);return archive.capture({sequence:last?.sequence??0,hash:last?.hash??null});},
  store:async artifact=>{await catalog.reserve(artifact.manifest);return store.store(artifact);},
  register:m=>catalog.complete(m.backupId),shutdown:options.shutdown,
 },randomUUID(),reason);
 return {catalog,store,clean,maintain,backup,scheduler:new BackupScheduler({now,catalog,clean:maintain,backup,onNotice:options.onNotice??(message=>{if(message)console.warn(message);})})};
}
