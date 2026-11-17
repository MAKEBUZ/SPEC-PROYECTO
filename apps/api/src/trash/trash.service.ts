import { createHash,createHmac,randomUUID,timingSafeEqual } from 'node:crypto';
import type { Pool,PoolClient } from 'pg';
import { SessionService } from '../auth/session.service.js';
import { inTransaction } from '../db/transaction.js';
import { runOperation,requestDigest } from '../operations/operation.service.js';
import type { Credential } from '../http/access.js';
import { ValidationError,uuid } from '../../../../packages/contracts/src/validation.js';
import type { HttpDto } from '../../../../packages/contracts/src/http-dto.js';
type Session=Extract<Credential,{kind:'session'}>;type Kind='project'|'pattern';
interface Resource {id:string;owner_id:string;project_id?:string;name:string;state:string;resource_revision:string;trash_batch_id:string|null;trashed_at:Date|null;expires_at:Date|null;live?:boolean}
const table=(kind:Kind)=>{if(kind==='project')return 'projects';if(kind==='pattern')return 'patterns';throw new ValidationError('INVALID_INPUT');};
export class TrashService {
  constructor(private readonly pool:Pool,private readonly sessions:SessionService,private readonly key:Buffer,private readonly keyVersion:string){}
  private async resource(c:PoolClient,s:Session,kind:Kind,id:string){uuid(id);const row=(await c.query<Resource>(`SELECT * FROM ${table(kind)} WHERE id=$1 AND owner_id=$2 FOR UPDATE`,[id,s.accountId])).rows[0];if(!row)throw new ValidationError('RESOURCE_UNAVAILABLE');return row;}
  async scopeIn(c:PoolClient,s:Session,kind:Kind,id:string,action:'trash'|'restore'|'purge'){
    const root=await this.resource(c,s,kind,id),children=kind==='project'?(await c.query<Resource>(`SELECT *,expires_at>clock_timestamp() AS live FROM patterns WHERE project_id=$1 AND owner_id=$2 ${action==='trash'?"AND state='active'":action==='restore'?'AND trash_batch_id=$3':''} ORDER BY id FOR UPDATE`,action==='restore'?[id,s.accountId,root.trash_batch_id]:[id,s.accountId])).rows:[];
    const patterns=kind==='pattern'?[root]:children,ids=patterns.map(p=>p.id);
    const stats=(await c.query<{versions:string;files:string;bytes:string}>(`SELECT (SELECT count(*) FROM versions WHERE pattern_id=ANY($1::uuid[])) AS versions,count(f.id) AS files,COALESCE(sum(f.bytes),0) AS bytes FROM stored_files f JOIN versions v ON v.id=f.version_id WHERE v.pattern_id=ANY($1::uuid[])`,[ids])).rows[0]!;
    const resources=[{kind,id:root.id,name:root.name,state:root.state,revision:root.resource_revision},...children.map(p=>({kind:'pattern',id:p.id,name:p.name,state:p.state,revision:p.resource_revision}))];
    const blockers=action==='purge'&&kind==='project'?children.filter(p=>p.state==='trashed'&&p.live===true&&p.trash_batch_id!==root.trash_batch_id).map(p=>({kind:'pattern',id:p.id,code:'DEPENDENCIES_BLOCK'})):[];
    if(action==='restore'){
      const batch=(await c.query<{state:string;live:boolean;root_kind:string;root_id:string}>('SELECT state,expires_at>clock_timestamp() AS live,root_kind,root_id FROM trash_batches WHERE id=$1',[root.trash_batch_id])).rows[0];
      if(!batch||batch.state!=='trashed'||!batch.live||batch.root_kind!==kind||batch.root_id!==id)blockers.push({kind,id,code:batch&&!batch.live?'RETENTION_EXPIRED':'DEPENDENCIES_BLOCK'});
      if(kind==='pattern'&&(await this.resource(c,s,'project',root.project_id!)).state!=='active')blockers.push({kind:'project',id:root.project_id!,code:'PARENT_TRASHED'});
    }
    const content={kind,id,action,resources,versions:Number(stats.versions),files:Number(stats.files),bytes:Number(stats.bytes),blockers},scopeRevision=createHash('sha256').update(JSON.stringify(content)).digest('hex');
    return {...content,scopeRevision,root,children};
  }
  scope(s:Session,input:HttpDto<'ScopeQuery'>){return inTransaction(this.pool,async c=>{await this.sessions.authorizeFor(c,s,'normal');if(input.kind==='account'||input.action==='delete-account')throw new ValidationError('INVALID_INPUT');const {root,children,...view}=await this.scopeIn(c,s,input.kind,input.id,input.action);await this.sessions.authorizeFor(c,s,'normal');return view;});}
  private mutate<T extends {operationId:string}>(s:Session,type:string,input:T,effect:(c:PoolClient)=>Promise<unknown>){return inTransaction(this.pool,async c=>{
    await this.sessions.authorizeFor(c,s,'normal');const r=await runOperation(c,{requesterId:s.accountId,operationType:type,operationId:input.operationId},requestDigest(input,this.key,this.keyVersion),async()=>{
      await c.query('SAVEPOINT trash_effect');try{const data=await effect(c);await this.sessions.authorizeFor(c,s,'normal');await c.query('RELEASE SAVEPOINT trash_effect');return {outcome:'success',data};}
      catch(e){if(!(e instanceof ValidationError))throw e;await c.query('ROLLBACK TO SAVEPOINT trash_effect');await c.query('RELEASE SAVEPOINT trash_effect');return {outcome:'failure',data:{code:e.code}};}
    });await c.query('UPDATE operation_results SET historical_owner_id=$1 WHERE requester_id=$1 AND operation_type=$2 AND operation_id=$3',[s.accountId,type,input.operationId]);return {operationId:input.operationId,...r};
  });}
  trash(s:Session,kind:Kind,id:string,input:HttpDto<'TrashResource'>){return this.mutate(s,kind==='project'?'trashProject':'trashPattern',{...input,kind,id},async c=>{
    const scope=await this.scopeIn(c,s,kind,id,'trash');if(scope.scopeRevision!==input.scopeRevision)throw new ValidationError('SCOPE_CHANGED');if(scope.root.state!=='active')throw new ValidationError('RESOURCE_TRASHED');
    if(kind==='pattern'&&(await this.resource(c,s,'project',scope.root.project_id!)).state!=='active')throw new ValidationError('PARENT_TRASHED');
    const batchId=randomUUID(),members=kind==='pattern'?[id]:scope.children.map(p=>p.id),batch=(await c.query<{confirmed_at:Date;expires_at:Date}>(`WITH t AS MATERIALIZED(SELECT clock_timestamp() AS now) INSERT INTO trash_batches(id,owner_id,cause_operation_id,root_kind,root_id,member_ids,confirmed_at,expires_at) SELECT $1,$2,$3,$4,$5,$6,now,now+interval '30 days' FROM t RETURNING confirmed_at,expires_at`,[batchId,s.accountId,input.operationId,kind,id,members])).rows[0]!;
    if(kind==='project')await c.query("UPDATE projects r SET state='trashed',trash_batch_id=b.id,trashed_at=b.confirmed_at,expires_at=b.expires_at,resource_revision=resource_revision+1,updated_at=clock_timestamp() FROM trash_batches b WHERE r.id=$1 AND b.id=$2",[id,batchId]);
    await c.query("UPDATE patterns r SET state='trashed',trash_batch_id=b.id,trashed_at=b.confirmed_at,expires_at=b.expires_at,resource_revision=resource_revision+1,updated_at=clock_timestamp() FROM trash_batches b WHERE r.id=ANY($1::uuid[]) AND b.id=$2",[members,batchId]);
    return {kind,id,trashedAt:batch.confirmed_at.toISOString(),expiresAt:batch.expires_at.toISOString(),causeOperationId:input.operationId};
  });}
  restore(s:Session,kind:Kind,id:string,input:HttpDto<'RestoreResource'>){return this.mutate(s,'restore',{...input,kind,id},async c=>{
    const root=await this.resource(c,s,kind,id);if(root.resource_revision!==input.expectedResourceRevision)throw new ValidationError('VERSION_CONFLICT');if(root.state!=='trashed'||!root.trash_batch_id)throw new ValidationError('RESOURCE_UNAVAILABLE');
    const batch=(await c.query<{id:string;root_kind:string;root_id:string;member_ids:string[];state:string;live:boolean}>('SELECT *,expires_at>clock_timestamp() AS live FROM trash_batches WHERE id=$1 FOR UPDATE',[root.trash_batch_id])).rows[0];if(!batch||batch.state!=='trashed')throw new ValidationError('DEPENDENCIES_BLOCK');if(!batch.live)throw new ValidationError('RETENTION_EXPIRED');
    if(kind==='pattern'&&(await this.resource(c,s,'project',root.project_id!)).state!=='active')throw new ValidationError('PARENT_TRASHED');
    if(batch.root_kind!==kind||batch.root_id!==id)throw new ValidationError('DEPENDENCIES_BLOCK');
    const members=(await c.query<Resource>('SELECT * FROM patterns WHERE id=ANY($1::uuid[]) FOR UPDATE',[batch.member_ids])).rows;
    if(members.length!==batch.member_ids.length||members.some(p=>p.owner_id!==s.accountId||p.state!=='trashed'||p.trash_batch_id!==batch.id))throw new ValidationError('DEPENDENCIES_BLOCK');
    await c.query("UPDATE patterns SET state='active',trash_batch_id=NULL,trashed_at=NULL,expires_at=NULL,resource_revision=resource_revision+1,updated_at=clock_timestamp() WHERE id=ANY($1::uuid[])",[batch.member_ids]);
    if(kind==='project')await c.query("UPDATE projects SET state='active',trash_batch_id=NULL,trashed_at=NULL,expires_at=NULL,resource_revision=resource_revision+1,updated_at=clock_timestamp() WHERE id=$1",[id]);
    const live=(await c.query<{live:boolean}>('SELECT expires_at>clock_timestamp() AS live FROM trash_batches WHERE id=$1',[batch.id])).rows[0]!.live;if(!live)throw new ValidationError('RETENTION_EXPIRED');
    await c.query("UPDATE trash_batches SET state='restored' WHERE id=$1",[batch.id]);return {kind,id,state:'active',restoredResourceIds:[...kind==='project'?[id]:[],...batch.member_ids]};
  });}
  list(s:Session,input:HttpDto<'Pagination'>){return inTransaction(this.pool,async c=>{
    await this.sessions.authorizeFor(c,s,'normal');let after='';if(input.cursor){try{const [payload,signature,...rest]=input.cursor.split('.');if(!payload||!signature||rest.length)throw new Error();const actual=Buffer.from(signature,'base64url'),expected=createHmac('sha256',this.key).update(payload).digest();if(actual.length!==expected.length||!timingSafeEqual(actual,expected))throw new Error();const parsed=JSON.parse(Buffer.from(payload,'base64url').toString());if(parsed.account!==s.accountId||parsed.scope!=='trash'||typeof parsed.after!=='string')throw new Error();after=parsed.after;}catch{throw new ValidationError('INVALID_INPUT');}}
    const limit=input.limit??25,rows=(await c.query(`SELECT r.*,b.cause_operation_id,b.root_kind,(b.expires_at>clock_timestamp() AND b.state='trashed' AND (r.kind='project' OR (parent.state='active' AND b.root_kind='pattern'))) AS recoverable FROM (SELECT 'project' AS kind,id,name,trash_batch_id,trashed_at,expires_at,NULL::uuid AS project_id FROM projects WHERE owner_id=$1 AND state='trashed' UNION ALL SELECT 'pattern',id,name,trash_batch_id,trashed_at,expires_at,project_id FROM patterns WHERE owner_id=$1 AND state='trashed') r JOIN trash_batches b ON b.id=r.trash_batch_id LEFT JOIN projects parent ON parent.id=r.project_id WHERE (r.kind||r.id::text)>$2 ORDER BY r.kind,r.id LIMIT $3`,[s.accountId,after,limit+1])).rows;
    const page=rows.slice(0,limit),last=page.at(-1),payload=last?Buffer.from(JSON.stringify({account:s.accountId,scope:'trash',after:last.kind+last.id})).toString('base64url'):null;
    await this.sessions.authorizeFor(c,s,'normal');return {items:page.map(r=>({kind:r.kind,id:r.id,name:r.name,trashedAt:r.trashed_at.toISOString(),expiresAt:r.expires_at.toISOString(),causeOperationId:r.cause_operation_id,independentFromProjectDeletion:r.kind==='pattern'&&r.root_kind==='pattern',recoverable:r.recoverable,...r.project_id?{parentProjectId:r.project_id}:{}})),nextCursor:rows.length>limit&&payload?`${payload}.${createHmac('sha256',this.key).update(payload).digest('base64url')}`:null};
  });}
}
