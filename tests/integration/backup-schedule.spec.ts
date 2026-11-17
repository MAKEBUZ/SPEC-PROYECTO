import {it,expect} from 'vitest';
import {mkdtemp,rm,access} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {postgresCluster} from '../support/postgres-cluster.js';
import {AccountHost} from '../support/account-host.js';
import {createBackupRuntime} from '../../apps/api/src/storage/backup-runtime.js';
import {LocalSuppressionLog} from '../../apps/api/src/storage/suppression-log.js';
import {inTransaction} from '../../apps/api/src/db/transaction.js';
import {maintenanceFor} from '../../apps/api/src/storage/maintenance-gate.js';
import {BACKUP_RETENTION_MS} from '../../apps/api/src/storage/backup-policy.js';
it('T091 drains a live API before real pg_dump, cancels failed shutdown and physically expires the backups',async()=>{
 const root=await mkdtemp(join(tmpdir(),'patron-live-backup-')),cluster=await postgresCluster('source_admin'),log=new LocalSuppressionLog(join(root,'suppression')),host=new AccountHost(cluster.pool,undefined,log,true);
 try{
  await host.start();const account=await host.verifiedAccount();let transactionRelease!:()=>void,entered!:()=>void;
  const admitted=new Promise<void>(r=>{entered=r;});
  const transaction=inTransaction(cluster.pool,async client=>{entered();await new Promise<void>(r=>{transactionRelease=r;});await client.query("UPDATE accounts SET display_name='Before backup' WHERE id=$1",[account.accountId]);});await admitted;
  let captured!:()=>void,continueDump!:()=>void,hold=true,fail=false,shutdowns=0,now=Date.now();const capturing=new Promise<void>(r=>{captured=r;});
  const runtime=createBackupRuntime({pool:cluster.pool,directory:join(root,'backups'),journal:log,now:()=>now,shutdown:async()=>{shutdowns++;},run:async(tool,args,input)=>{
   if(tool==='pg_dump'&&fail){fail=false;throw Error('INJECTED_DUMP_FAILURE');}
   if(tool==='pg_dump'&&hold){hold=false;captured();await new Promise<void>(r=>{continueDump=r;});}return cluster.run(tool,args,input);
  }});
  const backup=runtime.backup('daily');expect(maintenanceFor(cluster.pool).draining).toBe(true);
  expect((await host.request('GET','/account/profile',undefined,account.session)).status).toBe(409);
  transactionRelease();await transaction;await capturing;
  await expect(inTransaction(cluster.pool,async()=>{})).rejects.toThrow('BACKUP_MAINTENANCE');
  continueDump();const first=await backup;expect((await runtime.store.read(first.backupId)).manifest).toEqual(first);
  expect((await host.request('GET','/account/profile',undefined,account.session)).status).toBe(200);
  fail=true;await expect(runtime.scheduler.beforeShutdown()).rejects.toThrow('INJECTED_DUMP_FAILURE');expect(shutdowns).toBe(0);expect(runtime.scheduler.notice).toContain('canceló');expect(maintenanceFor(cluster.pool).draining).toBe(false);
  expect((await runtime.catalog.read()).filter(e=>e.verified)).toHaveLength(1);await access(join(root,'backups',first.backupId,'database.dump'));
  const final=await runtime.scheduler.beforeShutdown();expect(shutdowns).toBe(1);expect(maintenanceFor(cluster.pool).draining).toBe(true);
  expect((await host.request('GET','/account/profile',undefined,account.session)).status).toBe(409);
  now=final.capturedAt+BACKUP_RETENTION_MS;await runtime.clean();expect((await runtime.catalog.read()).every(e=>e.state==='deleted')).toBe(true);
  await expect(access(join(root,'backups',first.backupId))).rejects.toThrow();await expect(access(join(root,'backups',final.backupId))).rejects.toThrow();
 }finally{await host.close();await cluster.close();await rm(root,{recursive:true,force:true});}
},120000);
