import {createHash} from 'node:crypto';
import {S3Client,PutObjectCommand,GetObjectCommand,DeleteObjectCommand} from '@aws-sdk/client-s3';
import {uuid} from '../../../../packages/contracts/src/validation.js';
import {validateBackup,type BackupArtifact,type BackupManifest} from './backup-coordinator.js';

/** No lifecycle rule deletes this prefix: the catalog coordinates retirement
 * with suppression evidence, including partially uploaded backups. */
export class S3BackupStore {
 constructor(private readonly client:S3Client,private readonly bucket:string,private readonly owner:string){}
 private key(id:string,file:string){uuid(id);return `backups/${id}/${file}`;}
 private async put(id:string,file:string,body:Uint8Array){
  await this.client.send(new PutObjectCommand({Bucket:this.bucket,ExpectedBucketOwner:this.owner,Key:this.key(id,file),Body:body,ContentLength:body.length,ChecksumSHA256:createHash('sha256').update(body).digest('base64'),IfNoneMatch:'*',ServerSideEncryption:'AES256'}));
 }
 private async get(id:string,file:string){
  const result=await this.client.send(new GetObjectCommand({Bucket:this.bucket,ExpectedBucketOwner:this.owner,Key:this.key(id,file),ChecksumMode:'ENABLED'}));
  if(!result.Body)throw Error('BACKUP_BODY_MISSING');return result.Body.transformToByteArray();
 }
 async store(input:BackupArtifact){
  const a=validateBackup(input),id=a.manifest.backupId;
  await this.put(id,'database.dump',a.dump);await this.put(id,'roles.sql',a.roles);
  // Manifest is last; successful PUT alone does not establish a usable copy.
  await this.put(id,'manifest.json',Buffer.from(JSON.stringify(a.manifest)));
  return this.read(id);
 }
 async read(id:string){
  const manifest=JSON.parse(Buffer.from(await this.get(id,'manifest.json')).toString('utf8')) as BackupManifest;
  if(manifest.backupId!==id)throw Error('BACKUP_ID_MISMATCH');
  return validateBackup({manifest,dump:await this.get(id,'database.dump'),roles:await this.get(id,'roles.sql')});
 }
 async remove(id:string){
  for(const file of ['manifest.json','database.dump','roles.sql'])await this.client.send(new DeleteObjectCommand({Bucket:this.bucket,ExpectedBucketOwner:this.owner,Key:this.key(id,file)}));
 }
}
