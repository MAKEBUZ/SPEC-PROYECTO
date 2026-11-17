import {it,expect,vi,afterEach} from 'vitest';
import {randomUUID,createHash} from 'node:crypto';
import {mkdtemp,rm,access,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {BackupCatalog,removeLocalBackup} from '../../apps/api/src/storage/backup-catalog.js';
import {LocalBackupStore} from '../../apps/api/src/storage/local-backup-store.js';
import {BackupScheduler} from '../../apps/api/src/storage/backup-scheduler.js';
import {BACKUP_RETENTION_MS} from '../../apps/api/src/storage/backup-policy.js';
import {MaintenanceGate} from '../../apps/api/src/storage/maintenance-gate.js';
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
const manifest=(id=randomUUID())=>({backupId:id,schema:'test',engine:'18',capturedAt:1000,expiresAt:1000+BACKUP_RETENTION_MS,dumpHash:hash('dump'),rolesHash:hash('roles'),objects:[],watermark:{sequence:0,hash:null}});
afterEach(()=>vi.useRealTimers());
it('T091 waits for daily capture before one fresh shutdown backup, isolating observer failures',async()=>{
 let release!:()=>void;const reasons:string[]=[];
 const scheduler=new BackupScheduler({now:()=>1000,catalog:{read:async()=>[]},clean:async()=>{},onNotice:()=>{throw Error('observer');},backup:async reason=>{reasons.push(reason);if(reason==='daily')await new Promise<void>(r=>{release=r;});return manifest();}});
 const daily=scheduler.tick();await vi.waitFor(()=>expect(reasons).toEqual(['daily']));
 const shutdown=scheduler.beforeShutdown();expect(scheduler.beforeShutdown()).toBe(shutdown);release();await daily;await shutdown;
 expect(reasons).toEqual(['daily','shutdown']);await scheduler.tick();expect(reasons).toHaveLength(2);
 const failed=new BackupScheduler({now:()=>1000,catalog:{read:async()=>[]},clean:async()=>{throw Error('disk');},backup:async()=>manifest(),onNotice:()=>{throw Error('observer');}});
 await expect(failed.tick()).rejects.toThrow('disk');expect(failed.notice).toContain('limpieza');
});
it('T091 a drain timeout cancels capture admission without interrupting existing work',async()=>{
 vi.useFakeTimers();const gate=new MaintenanceGate();let release!:()=>void;
 const work=gate.run(()=>new Promise<void>(r=>{release=r;}));const drain=gate.drain(100);const rejected=expect(drain).rejects.toThrow('BACKUP_DRAIN_TIMEOUT');
 await vi.advanceTimersByTimeAsync(100);await rejected;expect(gate.draining).toBe(false);await gate.run(async()=>{});release();await work;const lease=await gate.drain();await lease.release();
});
it('T091 drains admitted nested work, rejects new roots and stale asynchronous contexts, then resumes',async()=>{
 const gate=new MaintenanceGate();let release!:()=>void,late!:()=>Promise<void>,finished=false;
 const running=gate.run(async()=>{late=()=>gate.run(async()=>{});await new Promise<void>(r=>{release=r;});await gate.run(async()=>{finished=true;});});
 const pending=gate.drain();expect(gate.draining).toBe(true);await expect(gate.run(async()=>{})).rejects.toThrow('BACKUP_MAINTENANCE');
 release();await running;const lease=await pending;expect(finished).toBe(true);await expect(late()).rejects.toThrow();await expect(gate.drain()).rejects.toThrow('BACKUP_ALREADY_RUNNING');
 await lease.release();await gate.run(async()=>{});await lease.release();
});
it('T091 physically removes only expired known backup files and resumes a failed cleanup after reopening',async()=>{
 const root=await mkdtemp(join(tmpdir(),'backup-clean-'));try{
  const catalog=new BackupCatalog(root),store=new LocalBackupStore(root),m=manifest();await catalog.reserve(m);await store.store({manifest:m,dump:Buffer.from('dump'),roles:Buffer.from('roles')});await catalog.complete(m.backupId);
  await catalog.clean(m.expiresAt-1,e=>removeLocalBackup(root,e.id));await access(join(root,m.backupId,'database.dump'));
  await expect(catalog.clean(m.expiresAt,async()=>{throw Error('occupied');})).rejects.toThrow('occupied');expect((await catalog.read())[0]!.state).toBe('deleting');
  await new BackupCatalog(root).clean(m.expiresAt,e=>removeLocalBackup(root,e.id));await expect(access(join(root,m.backupId))).rejects.toThrow();expect((await catalog.read())[0]!.state).toBe('deleted');
 }finally{await rm(root,{recursive:true,force:true});}
});
it('T091 partial unverified backups are tracked, and restore copies keep their original deadline',async()=>{
 const root=await mkdtemp(join(tmpdir(),'backup-partial-'));try{
  const c=new BackupCatalog(root),m=manifest();await c.reserve(m);expect((await c.read())[0]!.verified).toBe(false);
  await expect(c.copy(m.backupId,randomUUID(),'restore','patron-backup-'+randomUUID(),1001)).rejects.toThrow();await c.complete(m.backupId);
  await c.copy(m.backupId,randomUUID(),'restore','patron-backup-'+randomUUID(),1001);const entries=await c.read();expect(entries[1]!.capturedAt).toBe(m.capturedAt);
  const retired:string[]=[];await c.clean(m.expiresAt,async e=>{retired.push(e.kind);if(e.kind==='backup')await removeLocalBackup(root,e.id);});expect(retired).toEqual(['backup','restore']);expect((await c.read()).every(e=>e.state==='deleted')).toBe(true);
 }finally{await rm(root,{recursive:true,force:true});}
});
it('T091 refuses unexpected files and corrupted inventory without declaring cleanup complete',async()=>{
 const root=await mkdtemp(join(tmpdir(),'backup-guard-'));try{
  const c=new BackupCatalog(root),m=manifest();await c.reserve(m);await new LocalBackupStore(root).store({manifest:m,dump:Buffer.from('dump'),roles:Buffer.from('roles')});
  await writeFile(join(root,m.backupId,'user-file'),'keep');await expect(c.clean(m.expiresAt,e=>removeLocalBackup(root,e.id))).rejects.toThrow('BACKUP_PATH_UNSAFE');await access(join(root,m.backupId,'database.dump'));
  await writeFile(join(root,'catalog','000000000001.json'),'broken');await expect(c.clean(m.expiresAt,async()=>{throw Error('must not run');})).rejects.toThrow();
 }finally{await rm(root,{recursive:true,force:true});}
});
it('T091 schedules once when due, persists success through reopening, and cancels failed pre-shutdown',async()=>{
 const root=await mkdtemp(join(tmpdir(),'backup-schedule-'));try{
  vi.useFakeTimers();const catalog=new BackupCatalog(root);let now=1000,calls=0,fail=false;
  const ports={now:()=>now,catalog,clean:async()=>{},backup:async(reason:'daily'|'shutdown')=>{calls++;if(fail)throw Error('disk');const m={...manifest(),capturedAt:now,expiresAt:now+BACKUP_RETENTION_MS};await catalog.reserve(m);await catalog.complete(m.backupId);return m;}};
  const scheduler=new BackupScheduler(ports);await Promise.all([scheduler.tick(),scheduler.tick()]);expect(calls).toBe(1);
  const reopened=new BackupScheduler(ports);await reopened.tick();expect(calls).toBe(1);now+=86400000;await reopened.tick();expect(calls).toBe(2);
  fail=true;await expect(reopened.beforeShutdown()).rejects.toThrow();expect(reopened.notice).toContain('canceló');fail=false;await reopened.beforeShutdown();expect(calls).toBe(4);await reopened.tick();expect(calls).toBe(4);
  const clocked=new BackupScheduler(ports);clocked.start();await vi.advanceTimersByTimeAsync(0);now+=86400000;await vi.advanceTimersByTimeAsync(60000);await clocked.tick();expect(calls).toBe(5);await clocked.stop();now+=86400000;await vi.advanceTimersByTimeAsync(120000);expect(calls).toBe(5);
 }finally{await rm(root,{recursive:true,force:true});}
});
