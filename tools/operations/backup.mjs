import {parseArgs} from 'node:util';
import {resolve} from 'node:path';
import {connectLocalPostgres,retireLocalCopy} from './local-postgres.mjs';
import {LocalSuppressionLog} from '../../dist/apps/api/src/storage/suppression-log.js';
import {createBackupRuntime} from '../../dist/apps/api/src/storage/backup-runtime.js';
const {values}=parseArgs({options:{directory:{type:'string'},journal:{type:'string'},watch:{type:'boolean'},cleanup:{type:'boolean'}}});
if(!values.directory||!values.journal||values.watch&&values.cleanup)throw Error('Requiere --directory y --journal; elegir --watch o --cleanup, no ambos.');
const connection=connectLocalPostgres();
const runtime=createBackupRuntime({pool:connection.pool,run:connection.run,directory:resolve(values.directory),journal:new LocalSuppressionLog(resolve(values.journal)),drain:connection.drain,retireCopy:retireLocalCopy,shutdown:async()=>{throw Error('SHUTDOWN_NOT_AUTHORIZED');}});
try{
 if(values.watch){
  runtime.scheduler.start(true);console.log('Programación local activa; no autoriza apagar ni usar AWS.');
  await new Promise(done=>{process.once('SIGINT',done);process.once('SIGTERM',done);});await runtime.scheduler.stop();
 }else if(values.cleanup){await runtime.maintain();console.log(JSON.stringify({state:'local-cleanup-complete'}));}
 else{await runtime.maintain();const manifest=await runtime.backup('daily');console.log(JSON.stringify({backupId:manifest.backupId,expiresAt:manifest.expiresAt,state:'verified-local'}));}
}catch{console.error('Falló el respaldo o su limpieza; no se autoriza apagar.');process.exitCode=1;}finally{await runtime.scheduler.stop();await connection.pool.end();}

