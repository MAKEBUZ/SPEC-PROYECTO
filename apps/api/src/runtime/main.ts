import 'reflect-metadata';
import {readFile,access,writeFile,unlink} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {Pool} from 'pg';
import {S3Client} from '@aws-sdk/client-s3';
import {SESv2Client} from '@aws-sdk/client-sesv2';
import {AuthModule} from '../auth/auth.module.js';
import {PasswordCorpus} from '../auth/password-index.js';
import {PasswordService} from '../auth/password.service.js';
import {migrate} from '../db/migrate.js';
import {createLocalApi} from '../http/bootstrap.js';
import {S3BlobStore} from '../storage/s3-blob-store.js';
import {S3BackupStore} from '../storage/s3-backup-store.js';
import {S3SuppressionLog} from '../storage/s3-suppression-log.js';
import {SesMailTransport} from '../mail/ses-mail-transport.js';
import type {OutboxWorker} from '../mail/outbox.worker.js';
import {createBackupRuntime} from '../storage/backup-runtime.js';
import {runtimeConfig} from './config.js';
import {pgRunner} from './pg-runner.js';

export async function startApi(env:NodeJS.ProcessEnv=process.env){
 const config=runtimeConfig(env),pool=new Pool({connectionString:config.databaseUrl,max:10}),corpus=new PasswordCorpus();
 const s3=new S3Client({region:config.region,maxAttempts:3}),ses=new SESv2Client({region:config.region,maxAttempts:1});
 const journal=new S3SuppressionLog(s3,config.backupBucket,config.owner);
 let app:Awaited<ReturnType<typeof createLocalApi>>|undefined;
 try{
  // Operator provisions this marker together with the persistent catalog. A
  // missing volume cannot silently create an empty inventory and compact evidence.
  await access(join(config.stateDirectory,'initialized'));
  await journal.read();
  await corpus.reload(config.corpusDirectory,JSON.parse(await readFile('tools/assets/password-index.json','utf8')));
  await migrate(pool,resolve('apps/api/src/db/migrations'));
  if(!env.BACKUP_DATABASE_URL)throw Error('BACKUP_DATABASE_URL_REQUIRED');
  const backup=createBackupRuntime({pool,run:pgRunner(env.BACKUP_DATABASE_URL),directory:join(config.stateDirectory,'backups'),journal,store:new S3BackupStore(s3,config.backupBucket,config.owner),shutdown:async()=>{/* The operator stops EC2 only after the receipt and process exit. */}});
  app=await createLocalApi(AuthModule.withOutbox({pool,publicOrigin:config.publicOrigin,operationKey:config.operationKey,operationKeyVersion:config.keyVersion,passwords:new PasswordService(corpus),outboxKeyId:config.keyVersion,outboxKeys:new Map([[config.keyVersion,config.outboxKey]]),mailTransport:new SesMailTransport(ses,config.sender),blobStore:new S3BlobStore(s3,config.blobBucket,config.owner),suppressionLog:journal,renderAssets:{wasm:await readFile('node_modules/@resvg/resvg-wasm/index_bg.wasm'),font:await readFile(join(config.assetsDirectory,'NotoSans-Regular.ttf'))},artifactRunner:pathToFileURL(resolve('dist/apps/api/src/publications/artifact-runner.js'))}),undefined,false);
  // Verify a first off-host backup before accepting traffic or scheduling jobs.
  await backup.backup('daily');
  await app.listen(config.port,'0.0.0.0');
  const worker=app.get<OutboxWorker>('PATRON_OUTBOX_WORKER',{strict:false});let pending:Promise<void>|undefined;
  const timer=setInterval(()=>{if(!pending){pending=worker.dispatchPending().catch(()=>{console.warn('MAIL_DISPATCH_FAILED');}).finally(()=>{pending=undefined;});}},2000);timer.unref();
  backup.scheduler.start();
  const receipt=join(config.stateDirectory,'shutdown-ready.json');await unlink(receipt).catch(error=>{if(error.code!=='ENOENT')throw error;});
  const close=async()=>{clearInterval(timer);await pending;await backup.scheduler.stop();await app!.close();await corpus.close();await pool.end();s3.destroy();ses.destroy();};
  return {app,backup,close,prepareShutdown:async()=>{const manifest=await backup.scheduler.beforeShutdown();await close();await writeFile(receipt,JSON.stringify({backupId:manifest.backupId,capturedAt:manifest.capturedAt,preparedAt:Date.now()}),{flag:'wx',mode:0o600});}};
 }catch(error){await app?.close();await corpus.close();await pool.end();s3.destroy();ses.destroy();throw error;}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 startApi().then(runtime=>{
  // Controlled service stop drains workers; stopping the EC2 host still requires
  // the separate operator pre-stop backup procedure.
  let stopping=false;
  const stop=()=>{if(stopping)return;stopping=true;void runtime.prepareShutdown().then(()=>process.exit(0)).catch(()=>{console.error('SHUTDOWN_BACKUP_FAILED');stopping=false;});};
  process.on('SIGINT',stop);process.on('SIGTERM',stop);process.on('SIGUSR2',stop);
  console.log('API_READY');
 }).catch(()=>{console.error('API_START_FAILED');process.exitCode=1;});
}
