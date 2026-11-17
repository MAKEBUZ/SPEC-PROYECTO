import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {S3Client,PutObjectCommand,GetObjectCommand,DeleteObjectCommand} from '@aws-sdk/client-s3';
import {LocalBlobStore,type BlobStore} from './blob-store.js';

/** Private immutable objects. Credentials come from the EC2 instance role. */
export class S3BlobStore implements BlobStore {
 constructor(private readonly client:S3Client,private readonly bucket:string,private readonly owner:string){
  if(!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket)||!/^\d{12}$/.test(owner))throw Error('STORAGE_CONFIG_INVALID');
 }
 private key(key:string){if(!/^[a-f0-9]{64}$/.test(key))throw Error('STORAGE_KEY_INVALID');return `objects/${key}`;}
 async put(key:string,bytes:Uint8Array){return this.putStream(key,(async function*(){yield bytes;})(),{bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});}
 async putStream(key:string,source:AsyncIterable<Uint8Array>,expected:{bytes:number;sha256:string}){
  const target=this.key(key),captured={...expected};
  const directory=await mkdtemp(join(tmpdir(),'patronaje-upload-'));
  try{
   // Validate and spool before uploading; never retain a 100 MB upload in RAM.
   const local=new LocalBlobStore(directory);await local.putStream(key,source,captured);
   const body=createReadStream(join(directory,key));
   try{
    await this.client.send(new PutObjectCommand({Bucket:this.bucket,ExpectedBucketOwner:this.owner,Key:target,Body:body,ContentLength:captured.bytes,ChecksumSHA256:Buffer.from(captured.sha256,'hex').toString('base64'),IfNoneMatch:'*',ServerSideEncryption:'AES256'}));
   }catch(error){
    if(!(error instanceof Error)||error.name!=='PreconditionFailed')throw error;
    // A retry may find the committed object. Never overwrite a different body.
   }finally{body.destroy();}
   let count=0;const hash=createHash('sha256');
   for await(const chunk of this.open(key)){count+=chunk.length;if(count>captured.bytes)throw Error('STORAGE_CONTENT_MISMATCH');hash.update(chunk);}
   if(count!==captured.bytes||hash.digest('hex')!==captured.sha256)throw Error('STORAGE_CONTENT_MISMATCH');
   return captured;
  }finally{await rm(directory,{recursive:true,force:true});}
 }
 async *open(key:string,signal?:AbortSignal):AsyncIterable<Uint8Array>{
  const response=await this.client.send(new GetObjectCommand({Bucket:this.bucket,ExpectedBucketOwner:this.owner,Key:this.key(key),ChecksumMode:'ENABLED'}),signal?{abortSignal:signal}:{});
  const body=response.Body;
  if(!body)throw Error('STORAGE_BODY_MISSING');
  if(!('destroy' in body)){await body.transformToByteArray();throw Error('STORAGE_STREAM_UNSUPPORTED');}
  try{yield* body as AsyncIterable<Uint8Array>;}finally{body.destroy();}
 }
 async get(key:string){const chunks:Buffer[]=[];let size=0;for await(const chunk of this.open(key)){size+=chunk.length;if(size>100000000)throw Error('STORAGE_CONTENT_MISMATCH');chunks.push(Buffer.from(chunk));}return Buffer.concat(chunks);}
 async remove(key:string){await this.client.send(new DeleteObjectCommand({Bucket:this.bucket,ExpectedBucketOwner:this.owner,Key:this.key(key)}));}
}
