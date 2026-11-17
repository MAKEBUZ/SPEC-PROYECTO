import {describe,it,expect,vi} from 'vitest';
import {randomUUID,createHash} from 'node:crypto';
import {S3Client,PutObjectCommand,GetObjectCommand,DeleteObjectCommand} from '@aws-sdk/client-s3';
import {S3BackupStore} from '../../apps/api/src/storage/s3-backup-store.js';
import {S3SuppressionLog} from '../../apps/api/src/storage/s3-suppression-log.js';
import {BACKUP_RETENTION_MS} from '../../apps/api/src/storage/backup-policy.js';
function fake(){
 const data=new Map<string,{body:Buffer;etag:string}>();let revision=0;
 const send=vi.fn(async(command:unknown)=>{
  if(command instanceof GetObjectCommand){const entry=data.get(command.input.Key!);if(!entry)throw Object.assign(new Error(),{name:'NoSuchKey'});return {ETag:entry.etag,Body:{transformToByteArray:async()=>Buffer.from(entry.body),transformToString:async()=>entry.body.toString()}};}
  if(command instanceof PutObjectCommand){const i=command.input,old=data.get(i.Key!);if(i.IfNoneMatch&&old||i.IfMatch&&i.IfMatch!==old?.etag)throw Object.assign(new Error(),{name:'PreconditionFailed'});data.set(i.Key!,{body:Buffer.from(i.Body as Uint8Array),etag:`"${++revision}"`});return {};}
  if(command instanceof DeleteObjectCommand){data.delete(command.input.Key!);return {};}
  throw Error('unexpected');
 });return {data,send,client:{send} as unknown as S3Client};
}
describe('S3 recovery evidence',()=>{
 it('roundtrips and retires a verified remote backup',async()=>{
  const f=fake(),store=new S3BackupStore(f.client,'backups','847205414980'),dump=Buffer.from('dump'),roles=Buffer.from('roles'),hash=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
  const artifact={manifest:{backupId:randomUUID(),schema:'public',engine:'18.7',capturedAt:1,expiresAt:1+BACKUP_RETENTION_MS,dumpHash:hash(dump),rolesHash:hash(roles),objects:[],watermark:{sequence:0,hash:null}},dump,roles};
  expect(await store.store(artifact)).toEqual(structuredClone(artifact));await store.remove(artifact.manifest.backupId);expect(f.data.size).toBe(0);
 });
 it('rejects a missing journal instead of assuming no prior deletions',async()=>{
  const f=fake();await expect(new S3SuppressionLog(f.client,'backups','847205414980').read()).rejects.toThrow('SUPPRESSION_LOG_UNAVAILABLE');expect(f.data.size).toBe(0);
 });
 it('persists suppression intent and confirmation across client restarts',async()=>{
  const f=fake();f.data.set('evidence/journal.json',{body:Buffer.from('{}'),etag:'"initial"'});
  const journal=new S3SuppressionLog(f.client,'backups','847205414980'),id=randomUUID();
  await journal.append({id,kind:'intent',scope:{kind:'pattern',resourceIds:[randomUUID()],objectKeys:['a'.repeat(64)]}});
  const next=new S3SuppressionLog(f.client,'backups','847205414980');expect(await next.read()).toHaveLength(1);
  await next.append({id:randomUUID(),kind:'confirmed',intentId:id});expect(await journal.read()).toHaveLength(2);
 });
 it('never acknowledges an append if remote CAS fails',async()=>{
  const f=fake();f.data.set('evidence/journal.json',{body:Buffer.from('{}'),etag:'"initial"'});
  const original=f.send.getMockImplementation()!;
  f.send.mockImplementation(async command=>{if(command instanceof PutObjectCommand)throw Error('Conflict');return original(command);});
  const journal=new S3SuppressionLog(f.client,'backups','847205414980');await expect(journal.append({id:randomUUID(),kind:'intent',scope:{kind:'account',resourceIds:[randomUUID()],objectKeys:[]}})).rejects.toThrow('Conflict');expect(await journal.read()).toHaveLength(0);
 });
});
