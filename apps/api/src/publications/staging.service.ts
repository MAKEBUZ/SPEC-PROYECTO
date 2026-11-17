import {maintenanceFor} from '../storage/maintenance-gate.js';
import { createHash,randomBytes,randomUUID } from 'node:crypto';
import type { Pool,PoolClient } from 'pg';
import type { Credential } from '../http/access.js';
import type { BlobStore } from '../storage/blob-store.js';
import { verifiedDownload } from '../files/verified-download.js';
import { SessionService } from '../auth/session.service.js';
import { inTransaction } from '../db/transaction.js';
import { runOperation,requestDigest } from '../operations/operation.service.js';
import { canonicalize,revisionId } from '../../../../packages/document/src/revision.js';
import { parseDocument } from '../../../../packages/document/src/schema.js';
import { DTO } from '../../../../packages/contracts/src/http-dto.js';
import type { HttpDto } from '../../../../packages/contracts/src/http-dto.js';
import { ValidationError,uuid } from '../../../../packages/contracts/src/validation.js';
import { TokenOperationError } from '../auth/tokens.service.js';
import type { ErrorCode } from '../../../../packages/contracts/src/http.js';
type Session=Extract<Credential,{kind:'session'}>;
type Manifest=HttpDto<'BeginPublication'>['manifest'];
export const manifestDigest=(m:Manifest)=>createHash('sha256').update(canonicalize({documentId:m.documentId,localRevisionId:m.localRevisionId,files:m.files})).digest('hex');
export class QuotaError extends ValidationError {
  constructor(readonly quota:{usedBytes:number;reservedBytes:number;requestedBytes:number;limitBytes:number}){super('QUOTA_EXCEEDED');}
}
interface Publication {id:string;owner_id:string;project_id:string;pattern_id:string|null;document_id:string;local_revision_id:string;manifest_hash:string;state:string;validation_state:string;commit_operation_id:string|null;reservation_bytes:string}
interface FileRow {file_id:string;role:'editable'|'preview'|'pdf';bytes:string;sha256:string;private_key:string;media_type:string;upload_state:string}
const sha=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
export class StagingService {
  constructor(private readonly pool:Pool,private readonly sessions:SessionService,private readonly store:BlobStore,private readonly key:Buffer,private readonly keyVersion:string){}
  private async project(c:PoolClient,s:Session,id:string){const p=(await c.query('SELECT state FROM projects WHERE id=$1 AND owner_id=$2 FOR UPDATE',[id,s.accountId])).rows[0];if(!p)throw new ValidationError('RESOURCE_UNAVAILABLE');if(p.state!=='active')throw new ValidationError('RESOURCE_TRASHED');}
  private async publication(c:PoolClient,s:Session,id:string){uuid(id);const p=(await c.query<Publication>('SELECT * FROM publications WHERE id=$1 AND owner_id=$2',[id,s.accountId])).rows[0];if(!p)throw new ValidationError('RESOURCE_UNAVAILABLE');await this.project(c,s,p.project_id);return (await c.query<Publication>('SELECT * FROM publications WHERE id=$1 FOR UPDATE',[id])).rows[0]!;}
  async begin(s:Session,value:HttpDto<'BeginPublication'>){
    const input=DTO.BeginPublication.parse(value),m=input.manifest;
    if(manifestDigest(m)!==m.manifestHash)throw new ValidationError('ARTIFACT_MISMATCH');
    for(const f of m.files){if(f.role==='editable'&&!['application/json','application/vnd.patronaje+json'].includes(f.mediaType)||f.role==='preview'&&f.mediaType!=='image/png'||f.role==='pdf'&&f.mediaType!=='application/pdf')throw new ValidationError('INVALID_INPUT');}
    const result=await inTransaction(this.pool,async c=>{
      await this.sessions.authorizeFor(c,s,'normal');
      const r=await runOperation(c,{requesterId:s.accountId,operationType:'beginPublication',operationId:input.operationId},requestDigest(input,this.key,this.keyVersion),async()=>{
        await c.query('SAVEPOINT staging_effect');try{
        await this.project(c,s,input.projectId);
        if('patternId' in input){const p=(await c.query('SELECT state,latest_version_id FROM patterns WHERE id=$1 AND project_id=$2 AND owner_id=$3 FOR UPDATE',[input.patternId,input.projectId,s.accountId])).rows[0];if(!p)throw new ValidationError('RESOURCE_UNAVAILABLE');if(p.state!=='active')throw new ValidationError('RESOURCE_TRASHED');if(p.latest_version_id!==input.expectedVersionId)throw new ValidationError('VERSION_CONFLICT');}
        const quota=(await c.query<{used_bytes:string;reserved_bytes:string}>('SELECT used_bytes,reserved_bytes FROM accounts WHERE id=$1',[s.accountId])).rows[0]!;
        const requested=m.files.reduce((sum,f)=>sum+BigInt(f.bytes),0n);
        if(BigInt(quota.used_bytes)+BigInt(quota.reserved_bytes)+requested>2000000000n)throw new QuotaError({usedBytes:Number(quota.used_bytes),reservedBytes:Number(quota.reserved_bytes),requestedBytes:Number(requested),limitBytes:2000000000});
        const id=randomUUID();await c.query(`INSERT INTO publications(id,owner_id,project_id,pattern_id,pattern_name,expected_version_id,document_id,local_revision_id,manifest,manifest_hash,reservation_bytes) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11)`,[id,s.accountId,input.projectId,'patternId'in input?input.patternId:null,'patternName'in input?input.patternName.trim():null,'expectedVersionId'in input?input.expectedVersionId:null,m.documentId,m.localRevisionId,JSON.stringify(m),m.manifestHash,String(requested)]);
        for(const f of m.files)await c.query(`INSERT INTO publication_files(publication_id,file_id,role,original_name,media_type,bytes,sha256,private_key,export_profile_id,preparation_id,preparation_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,[id,f.fileId,f.role,f.originalName,f.mediaType,f.bytes,f.sha256,randomBytes(32).toString('hex'),'exportProfileId'in f?f.exportProfileId:null,'preparationId'in f?f.preparationId:null,'preparationHash'in f?f.preparationHash:null]);
        await c.query('UPDATE accounts SET reserved_bytes=reserved_bytes+$2 WHERE id=$1',[s.accountId,String(requested)]);await this.sessions.authorizeFor(c,s,'normal');await c.query('RELEASE SAVEPOINT staging_effect');return {outcome:'success',data:{publicationId:id,state:'staging',manifestHash:m.manifestHash,files:m.files.map(f=>({fileId:f.fileId,uploadState:'pending'}))}};
        }catch(e){if(!(e instanceof ValidationError))throw e;await c.query('ROLLBACK TO SAVEPOINT staging_effect');await c.query('RELEASE SAVEPOINT staging_effect');return {outcome:'failure',data:{code:e.code,...e instanceof QuotaError?{quota:e.quota}:{}}};}
      });
      await c.query('UPDATE operation_results SET historical_owner_id=$1 WHERE requester_id=$1 AND operation_type=$2 AND operation_id=$3',[s.accountId,'beginPublication',input.operationId]);return r;
    });if(result.outcome==='failure')throw new TokenOperationError(input.operationId,result.data as {code:ErrorCode});return result.data;
  }
  async upload(s:Session,id:string,fileId:string,bytes:Uint8Array){
    uuid(fileId);if(bytes.length>100000000)throw new ValidationError('FILE_TOO_LARGE');
    return this.uploadStream(s,id,fileId,(async function*(){yield bytes;})(),{bytes:bytes.length,sha256:sha(bytes)});
  }
  uploadStream(s:Session,id:string,fileId:string,source:AsyncIterable<Uint8Array>,expected:{bytes:number;sha256:string}){return maintenanceFor(this.pool).run(()=>this.uploadAdmitted(s,id,fileId,source,expected));}
  private async uploadAdmitted(s:Session,id:string,fileId:string,source:AsyncIterable<Uint8Array>,expected:{bytes:number;sha256:string}){
    expected={...expected};
    uuid(fileId);
    // Check the manifest before accepting the stream, then reauthorize after I/O.
    await inTransaction(this.pool,async c=>{
      await this.sessions.authorizeFor(c,s,'normal');const p=await this.publication(c,s,id);
      if(p.state!=='staging')throw new ValidationError('OPERATION_PENDING');
      const f=(await c.query<FileRow>('SELECT * FROM publication_files WHERE publication_id=$1 AND file_id=$2',[id,fileId])).rows[0];
      if(!f)throw new ValidationError('RESOURCE_UNAVAILABLE');
      if(Number(f.bytes)!==expected.bytes||f.sha256!==expected.sha256)throw new ValidationError('ARTIFACT_MISMATCH');
    });
    const snapshot=await verifiedDownload(source,expected.bytes,expected.sha256);
    try{return await inTransaction(this.pool,async c=>{
      await this.sessions.authorizeFor(c,s,'normal');const p=await this.publication(c,s,id);
      if(p.state!=='staging')throw new ValidationError('OPERATION_PENDING');
      const file=(await c.query<FileRow>('SELECT * FROM publication_files WHERE publication_id=$1 AND file_id=$2 FOR UPDATE',[id,fileId])).rows[0];if(!file)throw new ValidationError('RESOURCE_UNAVAILABLE');
      if(Number(file.bytes)!==expected.bytes||file.sha256!==expected.sha256)throw new ValidationError('ARTIFACT_MISMATCH');
      if(file.role==='editable'){
        // Parsing the editable model needs its complete JSON, but transfer,
        // object writes and verification never duplicate a whole file buffer.
        const bytes=await snapshot.read();
        let doc;try{doc=parseDocument(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{throw new ValidationError('INVALID_INPUT');}
        if(doc.documentId!==p.document_id||doc.revisionId!==p.local_revision_id||revisionId(doc)!==p.local_revision_id)throw new ValidationError('ARTIFACT_MISMATCH');
      }else{
        const prefix=Buffer.concat(await snapshot.stream({start:0,end:Math.min(7,expected.bytes-1)}).toArray());
        if(file.role==='preview'?!prefix.equals(Buffer.from([137,80,78,71,13,10,26,10])):prefix.subarray(0,5).toString('ascii')!=='%PDF-')throw new ValidationError('ARTIFACT_MISMATCH');
      }
      const stored=await this.store.putStream(file.private_key,snapshot.stream(),expected);
      let size=0;const digest=createHash('sha256');for await(const chunk of this.store.open(file.private_key)){size+=chunk.byteLength;if(size>expected.bytes)throw Error('STORAGE_VERIFICATION_FAILED');digest.update(chunk);}
      if(stored.bytes!==expected.bytes||stored.sha256!==file.sha256||size!==expected.bytes||digest.digest('hex')!==file.sha256)throw new Error('STORAGE_VERIFICATION_FAILED');
      if(file.upload_state!=='received')await c.query("UPDATE publication_files SET upload_state='received',received_at=clock_timestamp() WHERE publication_id=$1 AND file_id=$2",[id,fileId]);
      await this.sessions.authorizeFor(c,s,'normal');return {fileId,bytes:expected.bytes,sha256:file.sha256,uploadState:'received'};
    });}finally{await snapshot.dispose();}
  }
  get(s:Session,id:string){return inTransaction(this.pool,async c=>{await this.sessions.authorizeFor(c,s,'normal');const p=await this.publication(c,s,id);const files=(await c.query<FileRow>('SELECT file_id,upload_state FROM publication_files WHERE publication_id=$1 ORDER BY file_id',[id])).rows;await this.sessions.authorizeFor(c,s,'normal');return {publicationId:id,state:p.state,manifestHash:p.manifest_hash,validationState:p.validation_state,commitOperationId:p.commit_operation_id,files:files.map(f=>({fileId:f.file_id,uploadState:f.upload_state}))};});}
  /** Only explicit terminal abandonment is eligible; never inferred from age. */
  abandon(s:Session,id:string,input:HttpDto<'Operation'>){return inTransaction(this.pool,async c=>{
    await this.sessions.authorizeFor(c,s,'normal');uuid(id);
    const r=await runOperation(c,{requesterId:s.accountId,operationType:'abandonPublication',operationId:input.operationId},requestDigest({...input,id},this.key,this.keyVersion),async()=>{
      await c.query('SAVEPOINT abandon_effect');try{
        const p=(await c.query<Publication>('SELECT * FROM publications WHERE id=$1 AND owner_id=$2 FOR UPDATE',[id,s.accountId])).rows[0];if(!p)throw new ValidationError('RESOURCE_UNAVAILABLE');
        if(!['staging','rejected','abandoned'].includes(p.state))throw new ValidationError('OPERATION_PENDING');
        if(p.commit_operation_id){const op=(await c.query("SELECT state,outcome FROM operation_results WHERE requester_id=$1 AND operation_type='commitPublication' AND operation_id=$2",[s.accountId,p.commit_operation_id])).rows[0];if(!op||op.state!=='resolved'||op.outcome!=='failure')throw new ValidationError('OPERATION_PENDING');}
        if(p.state!=='abandoned'){await c.query('UPDATE accounts SET reserved_bytes=reserved_bytes-$2 WHERE id=$1',[s.accountId,p.reservation_bytes]);await c.query("UPDATE publications SET state='abandoned',reservation_bytes=0 WHERE id=$1",[id]);}
        await this.sessions.authorizeFor(c,s,'normal');await c.query('RELEASE SAVEPOINT abandon_effect');return {outcome:'success',data:{abandoned:true}};
      }catch(e){if(!(e instanceof ValidationError))throw e;await c.query('ROLLBACK TO SAVEPOINT abandon_effect');await c.query('RELEASE SAVEPOINT abandon_effect');return {outcome:'failure',data:{code:e.code}};}
    });return {operationId:input.operationId,...r};
  });}
  cleanAbandoned(){return maintenanceFor(this.pool).run(()=>this.cleanAdmitted());}
  private async cleanAdmitted(){
    const files=(await this.pool.query<{id:string;private_key:string}>("SELECT p.id,f.private_key FROM publications p JOIN publication_files f ON f.publication_id=p.id WHERE p.state='abandoned' AND (p.commit_operation_id IS NULL OR EXISTS(SELECT 1 FROM operation_results o WHERE o.requester_id=p.owner_id AND o.operation_type='commitPublication' AND o.operation_id=p.commit_operation_id AND o.state='resolved' AND o.outcome='failure'))")).rows;
    for(const f of files)await this.store.remove(f.private_key); // Records remain durable retry evidence.
  }
}

