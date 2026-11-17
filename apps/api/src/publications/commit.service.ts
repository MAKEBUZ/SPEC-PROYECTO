import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { SessionService } from '../auth/session.service.js';
import type { Credential } from '../http/access.js';
import { inTransaction } from '../db/transaction.js';
import { requestDigest } from '../operations/operation.service.js';
import { ValidationError,uuid } from '../../../../packages/contracts/src/validation.js';
import type { ErrorCode } from '../../../../packages/contracts/src/http.js';
import type { HttpDto } from '../../../../packages/contracts/src/http-dto.js';
import { fileViews } from '../files/file-view.js';
type Session=Extract<Credential,{kind:'session'}>;
interface Publication {id:string;owner_id:string;project_id:string;pattern_id:string|null;pattern_name:string|null;expected_version_id:string|null;document_id:string;local_revision_id:string;manifest_hash:string;state:string;validation_state:string;validated_manifest_hash:string|null;validation_error:ErrorCode|null;commit_operation_id:string|null;commit_session_id:string|null;reservation_bytes:string}
interface Operation {request_hash:string;state:string;outcome:string|null;data:unknown;confirmed_at:Date|null}
const response=(id:string,r:Operation)=>r.state==='pending'?{operationId:id,state:'pending'}:{operationId:id,state:'resolved',outcome:r.outcome,confirmedAt:r.confirmed_at!.toISOString(),data:r.data};
export class CommitService {
  constructor(private readonly pool:Pool,private readonly sessions:SessionService,private readonly key:Buffer,private readonly keyVersion:string){}
  request(s:Session,id:string,input:HttpDto<'CommitPublication'>){return inTransaction(this.pool,async c=>{
    uuid(id);await this.sessions.authorizeFor(c,s,'normal');const digest=requestDigest({...input,publicationId:id},this.key,this.keyVersion),values=[s.accountId,'commitPublication',input.operationId];
    const inserted=await c.query("INSERT INTO operation_results(requester_id,operation_type,operation_id,historical_owner_id,request_hash,state) VALUES($1,$2,$3,$1,$4,'pending') ON CONFLICT DO NOTHING RETURNING operation_id",[...values,digest]);
    const op=(await c.query<Operation>('SELECT * FROM operation_results WHERE requester_id=$1 AND operation_type=$2 AND operation_id=$3 FOR UPDATE',values)).rows[0]!;
    if(op.request_hash!==digest)throw new ValidationError('IDEMPOTENCY_CONFLICT');if(!inserted.rowCount)return response(input.operationId,op);
    await c.query('SAVEPOINT request_effect');try{
      const p=(await c.query<Publication>('SELECT * FROM publications WHERE id=$1 AND owner_id=$2 FOR UPDATE',[id,s.accountId])).rows[0];if(!p)throw new ValidationError('RESOURCE_UNAVAILABLE');
      if(p.manifest_hash!==input.manifestHash)throw new ValidationError('ARTIFACT_MISMATCH');if(p.commit_operation_id||p.state!=='staging')throw new ValidationError('OPERATION_PENDING');
      const files=(await c.query<{complete:boolean;count:string}>("SELECT bool_and(upload_state='received') AS complete,count(*) FROM publication_files WHERE publication_id=$1",[id])).rows[0]!;if(!files.complete||Number(files.count)<2)throw new ValidationError('PUBLICATION_INCOMPLETE');
      await this.sessions.authorizeFor(c,s,'normal');await c.query("UPDATE publications SET commit_operation_id=$2,commit_session_id=$3,state='validating',validation_state='running' WHERE id=$1",[id,input.operationId,s.sessionId]);await c.query('RELEASE SAVEPOINT request_effect');return {operationId:input.operationId,state:'pending'};
    }catch(e){if(!(e instanceof ValidationError))throw e;await c.query('ROLLBACK TO SAVEPOINT request_effect');await c.query('RELEASE SAVEPOINT request_effect');const r=(await c.query<Operation>("UPDATE operation_results SET state='resolved',outcome='failure',confirmed_at=clock_timestamp(),data=$4::jsonb WHERE requester_id=$1 AND operation_type=$2 AND operation_id=$3 RETURNING *",[...values,JSON.stringify({code:e.code})])).rows[0]!;return response(input.operationId,r);}
  });}
  async finish(id:string){
    const candidate=(await this.pool.query<Publication>("SELECT * FROM publications WHERE id=$1 AND state='validated'",[id])).rows[0];if(!candidate||!candidate.commit_operation_id||!candidate.commit_session_id)return;
    return inTransaction(this.pool,async c=>{
      const s:Session={kind:'session',accountId:candidate.owner_id,sessionId:candidate.commit_session_id!,accessClass:'normal',accountStatus:'active',verified:true,expiresAt:0,revoked:false};
      // Serialize account and session even when authorization will fail. No
      // mutation of visible versions precedes the savepoint/final auth checks.
      await c.query('SELECT id FROM accounts WHERE id=$1 FOR UPDATE',[s.accountId]);await c.query('SELECT id FROM sessions WHERE id=$1 FOR UPDATE',[s.sessionId]);
      const p=(await c.query<Publication>('SELECT * FROM publications WHERE id=$1 FOR UPDATE',[id])).rows[0];if(!p||p.state!=='validated')return;
      const values=[p.owner_id,'commitPublication',p.commit_operation_id];const op=(await c.query<Operation>('SELECT * FROM operation_results WHERE requester_id=$1 AND operation_type=$2 AND operation_id=$3 FOR UPDATE',values)).rows[0];if(!op||op.state!=='pending')return;
      let outcome:'success'|'failure'='success',data:unknown;
      await c.query('SAVEPOINT version_effect');try{
        await this.sessions.authorizeFor(c,s,'normal');
        if(p.validation_state!=='valid'||p.validated_manifest_hash!==p.manifest_hash)throw new ValidationError(p.validation_error??'ARTIFACT_MISMATCH');
        if((await c.query("SELECT 1 FROM publication_files f LEFT JOIN publication_pdf_proofs proof ON proof.publication_id=f.publication_id AND proof.file_id=f.file_id WHERE f.publication_id=$1 AND f.role='pdf' AND (proof.sha256 IS DISTINCT FROM f.sha256 OR proof.measurement IS NULL)",[id])).rowCount)throw new ValidationError('ARTIFACT_MISMATCH');
        const project=(await c.query('SELECT owner_id,state FROM projects WHERE id=$1 FOR UPDATE',[p.project_id])).rows[0];if(!project||project.owner_id!==p.owner_id)throw new ValidationError('RESOURCE_UNAVAILABLE');if(project.state!=='active')throw new ValidationError('RESOURCE_TRASHED');
        const patternId=p.pattern_id??randomUUID();
        if(p.pattern_id){const pattern=(await c.query('SELECT owner_id,project_id,state,latest_version_id FROM patterns WHERE id=$1 FOR UPDATE',[patternId])).rows[0];if(!pattern||pattern.owner_id!==p.owner_id||pattern.project_id!==p.project_id)throw new ValidationError('RESOURCE_UNAVAILABLE');if(pattern.state!=='active')throw new ValidationError('RESOURCE_TRASHED');if(pattern.latest_version_id!==p.expected_version_id)throw new ValidationError('VERSION_CONFLICT');}
        else await c.query('INSERT INTO patterns(id,project_id,owner_id,name) VALUES($1,$2,$3,$4)',[patternId,p.project_id,p.owner_id,p.pattern_name]);
        const quota=(await c.query<{used_bytes:string;reserved_bytes:string}>('SELECT used_bytes,reserved_bytes FROM accounts WHERE id=$1',[p.owner_id])).rows[0]!;
        if(BigInt(quota.reserved_bytes)<BigInt(p.reservation_bytes)||BigInt(quota.used_bytes)+BigInt(quota.reserved_bytes)>2000000000n)throw new ValidationError('QUOTA_EXCEEDED');
        const ordinal=Number((await c.query<{ordinal:string}>('SELECT COALESCE(MAX(ordinal),0)+1 AS ordinal FROM versions WHERE pattern_id=$1',[patternId])).rows[0]!.ordinal),versionId=randomUUID();
        const version=(await c.query<{created_at:Date}>(`INSERT INTO versions(id,pattern_id,ordinal,author_id,document_id,local_revision_id,publication_id,commit_operation_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING created_at`,[versionId,patternId,ordinal,p.owner_id,p.document_id,p.local_revision_id,id,p.commit_operation_id])).rows[0]!;
        await c.query(`INSERT INTO stored_files(id,version_id,role,original_name,media_type,bytes,sha256,private_key,document_id,local_revision_id,export_profile_id,preparation_id,preparation_hash,pdf_measurement) SELECT gen_random_uuid(),$2,f.role,f.original_name,f.media_type,f.bytes,f.sha256,f.private_key,$3,$4,f.export_profile_id,f.preparation_id,f.preparation_hash,proof.measurement FROM publication_files f LEFT JOIN publication_pdf_proofs proof ON proof.publication_id=f.publication_id AND proof.file_id=f.file_id WHERE f.publication_id=$1 AND f.upload_state='received'`,[id,versionId,p.document_id,p.local_revision_id]);
        await c.query('UPDATE patterns SET latest_version_id=$2,resource_revision=resource_revision+$3,updated_at=clock_timestamp() WHERE id=$1',[patternId,versionId,p.pattern_id?1:0]);
        await c.query('UPDATE accounts SET used_bytes=used_bytes+$2,reserved_bytes=reserved_bytes-$2 WHERE id=$1',[p.owner_id,p.reservation_bytes]);
        await c.query("UPDATE publications SET state='committed',reservation_bytes=0,committed_at=$2 WHERE id=$1",[id,version.created_at]);
        await this.sessions.authorizeFor(c,s,'normal');
        const files=await fileViews(c,versionId);
        data={patternId,versionId,ordinal,committedAt:version.created_at.toISOString(),localRevisionId:p.local_revision_id,files};await c.query('RELEASE SAVEPOINT version_effect');
      }catch(e){if(!(e instanceof ValidationError))throw e;await c.query('ROLLBACK TO SAVEPOINT version_effect');await c.query('RELEASE SAVEPOINT version_effect');outcome='failure';data={code:e.code};await c.query("UPDATE publications SET state='rejected' WHERE id=$1",[id]);}
      const row=(await c.query<Operation>("UPDATE operation_results SET state='resolved',outcome=$4,data=$5::jsonb,confirmed_at=clock_timestamp() WHERE requester_id=$1 AND operation_type=$2 AND operation_id=$3 RETURNING *",[...values,outcome,JSON.stringify(data)])).rows[0]!;return response(p.commit_operation_id!,row);
    });
  }
  async finishReady(){for(const p of (await this.pool.query<{id:string}>("SELECT id FROM publications WHERE state='validated' ORDER BY created_at,id")).rows)await this.finish(p.id);}
}


