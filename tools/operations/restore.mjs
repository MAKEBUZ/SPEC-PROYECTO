import {parseArgs} from 'node:util';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {BackupCatalog} from '../../dist/apps/api/src/storage/backup-catalog.js';
import {connectLocalPostgres} from './local-postgres.mjs';
import {PostgresBackup,verifyBackupObject} from '../../dist/apps/api/src/storage/postgres-backup.js';
import {LocalBackupStore} from '../../dist/apps/api/src/storage/local-backup-store.js';
import {LocalSuppressionLog} from '../../dist/apps/api/src/storage/suppression-log.js';
import {LocalBlobStore} from '../../dist/apps/api/src/storage/blob-store.js';
import {runIsolatedRestore} from '../../dist/apps/api/src/storage/backup-coordinator.js';
import {applyRestoredSuppressions} from '../../dist/apps/api/src/storage/restore-suppressions.js';
const {values}=parseArgs({options:{directory:{type:'string'},journal:{type:'string'},blobs:{type:'string'},id:{type:'string'}}});
if(!values.directory||!values.journal||!values.blobs||!values.id)throw Error('Requiere --directory, --journal, --blobs e --id. Solo clúster vacío de ensayo.');
const connection=connectLocalPostgres();let lease;
try{
 await new BackupCatalog(resolve(values.directory)).copy(values.id,randomUUID(),'restore',connection.container,Date.now());
 const artifact=await new LocalBackupStore(resolve(values.directory)).read(values.id),log=new LocalSuppressionLog(resolve(values.journal)),blobs=new LocalBlobStore(resolve(values.blobs)),archive=new PostgresBackup(connection.pool,connection.run);
 lease=await connection.drain();
 const result=await runIsolatedRestore({isolate:async()=>({traffic:false,jobs:false,mail:false}),evidence:()=>log.read(),restore:a=>archive.restore(a),suppress:s=>applyRestoredSuppressions(connection.pool,s),verifyObject:o=>verifyBackupObject(o,k=>blobs.open(k)),seal:async()=>{}},artifact,Date.now());
 console.log(JSON.stringify(result));
}catch{console.error('Restauración no completada; mantener el entorno aislado.');process.exitCode=1;}finally{await lease?.release();await connection.pool.end();}
