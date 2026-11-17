import {mkdtemp,readFile,writeFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {S3Client,GetObjectCommand,PutObjectCommand} from '@aws-sdk/client-s3';
import {createHash} from 'node:crypto';
import {LocalSuppressionLog,type SuppressionEvent} from './suppression-log.js';
import type {RecoverableCopy} from './backup-policy.js';

/** One CAS-protected external journal. Reuses the validated local format inside
 * a private temporary directory, never the running database's backup image. */
export class S3SuppressionLog {
 private tail:Promise<unknown>=Promise.resolve();
 constructor(private readonly client:S3Client,private readonly bucket:string,private readonly owner:string){}
 private transaction<T>(change:boolean,work:(log:LocalSuppressionLog)=>Promise<T>):Promise<T>{
  const next=this.tail.catch(()=>{}).then(async()=>{
   const directory=await mkdtemp(join(tmpdir(),'patronaje-journal-'));
   try{
    let etag:string|undefined,files:Record<string,string>={};
    try{
     const response=await this.client.send(new GetObjectCommand({Bucket:this.bucket,ExpectedBucketOwner:this.owner,Key:'evidence/journal.json',ChecksumMode:'ENABLED'}));
     if(!response.Body||!response.ETag)throw Error('SUPPRESSION_LOG_DAMAGED');
     etag=response.ETag;const input:unknown=JSON.parse(await response.Body.transformToString());
     if(!input||typeof input!=='object'||Array.isArray(input))throw Error('SUPPRESSION_LOG_DAMAGED');
     for(const [name,value] of Object.entries(input)){
      if(!/^(\d{12}\.json|compaction\.json)$/.test(name)||typeof value!=='string')throw Error('SUPPRESSION_LOG_DAMAGED');
      files[name]=value;await writeFile(join(directory,name),value,{flag:'wx',mode:0o600});
     }
    }catch{throw Error('SUPPRESSION_LOG_UNAVAILABLE');}
    const log=new LocalSuppressionLog(directory);await log.read();const result=await work(log);
    if(change){
     files={};for(const name of await readdir(directory))files[name]=await readFile(join(directory,name),'utf8');
     const body=Buffer.from(JSON.stringify(files));
     await this.client.send(new PutObjectCommand({Bucket:this.bucket,ExpectedBucketOwner:this.owner,Key:'evidence/journal.json',Body:body,ContentLength:body.length,ChecksumSHA256:createHash('sha256').update(body).digest('base64'),ServerSideEncryption:'AES256',...(etag?{IfMatch:etag}:{IfNoneMatch:'*'})}));
    }
    return result;
   }finally{await rm(directory,{recursive:true,force:true});}
  });this.tail=next;return next;
 }
 read(){return this.transaction(false,log=>log.read());}
 append(event:SuppressionEvent){const captured=structuredClone(event);return this.transaction(true,log=>log.append(captured));}
 compact(copies:readonly RecoverableCopy[],settled:ReadonlySet<string>){const inventory=structuredClone(copies),ids=new Set(settled);return this.transaction(true,log=>log.compact(inventory,ids));}
}
