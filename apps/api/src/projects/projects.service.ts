import { createHmac,randomUUID,timingSafeEqual } from 'node:crypto';
import type { Pool,PoolClient } from 'pg';
import type { Credential } from '../http/access.js';
import { SessionService } from '../auth/session.service.js';
import { inTransaction } from '../db/transaction.js';
import { runOperation,requestDigest } from '../operations/operation.service.js';
import { ValidationError,uuid } from '../../../../packages/contracts/src/validation.js';
import { TokenOperationError } from '../auth/tokens.service.js';
import type { HttpDto } from '../../../../packages/contracts/src/http-dto.js';
type Session=Extract<Credential,{kind:'session'}>;
interface ProjectRow {id:string;owner_id:string;name:string;state:'active'|'trashed';resource_revision:string;created_at:Date;updated_at:Date;trashed_at:Date|null;expires_at:Date|null;cursor_time:string}
const view=(p:ProjectRow)=>({id:p.id,ownerId:p.owner_id,name:p.name,state:p.state,resourceRevision:p.resource_revision,createdAt:p.created_at.toISOString(),updatedAt:p.updated_at.toISOString(),trashedAt:p.trashed_at?.toISOString()??null,expiresAt:p.expires_at?.toISOString()??null});
export class ProjectsService {
  constructor(private readonly pool:Pool,private readonly sessions:SessionService,private readonly key:Buffer,private readonly keyVersion:string){}
  publicationStatus(session:Session,id:string){return inTransaction(this.pool,async c=>{
    uuid(id);await this.sessions.authorizeFor(c,session,'normal');
    const p=(await c.query('SELECT p.id,p.project_id,p.latest_version_id,p.state,pr.state AS project_state FROM patterns p JOIN projects pr ON pr.id=p.project_id WHERE p.id=$1 AND p.owner_id=$2 AND pr.owner_id=$2',[id,session.accountId])).rows[0];
    let result:unknown;
    if(p){if(p.state!=='active'||p.project_state!=='active')result={kind:'trashed',patternId:id};else if(p.latest_version_id)result={kind:'active',patternId:id,projectId:p.project_id,versionId:p.latest_version_id};else throw new ValidationError('RESOURCE_UNAVAILABLE');}
    else {const proof=(await c.query("SELECT operation_id,completed_at FROM purge_jobs WHERE owner_id=$1 AND state='complete' AND completed_at IS NOT NULL AND ((root_kind='pattern' AND root_id=$2) OR $2=ANY(member_ids)) ORDER BY completed_at DESC LIMIT 1",[session.accountId,id])).rows[0];if(!proof)throw new ValidationError('RESOURCE_UNAVAILABLE');result={kind:'deleted-confirmed',patternId:id,operationId:proof.operation_id,confirmedAt:proof.completed_at.toISOString()};}
    await this.sessions.authorizeFor(c,session,'normal');return result;
  });}
  private async active(client:PoolClient,session:Session,id:string){
    uuid(id);const p=(await client.query<ProjectRow>('SELECT *,created_at::text AS cursor_time FROM projects WHERE id=$1 AND owner_id=$2 FOR UPDATE',[id,session.accountId])).rows[0];
    if(!p)throw new ValidationError('RESOURCE_UNAVAILABLE');if(p.state!=='active')throw new ValidationError('RESOURCE_TRASHED');return p;
  }
  private async mutate<T extends {operationId:string}>(session:Session,type:string,input:T,effect:(c:PoolClient)=>Promise<unknown>){
    const result=await inTransaction(this.pool,async c=>{
      await this.sessions.authorizeFor(c,session,'normal');
      const r=await runOperation(c,{requesterId:session.accountId,operationType:type,operationId:input.operationId},requestDigest(input,this.key,this.keyVersion),async()=>{
        await c.query('SAVEPOINT project_effect');
        try{const data=await effect(c);await this.sessions.authorizeFor(c,session,'normal');await c.query('RELEASE SAVEPOINT project_effect');return {outcome:'success',data};}
        catch(e){if(!(e instanceof ValidationError))throw e;await c.query('ROLLBACK TO SAVEPOINT project_effect');await c.query('RELEASE SAVEPOINT project_effect');return {outcome:'failure',data:{code:e.code}};}
      });
      await c.query('UPDATE operation_results SET historical_owner_id=$1 WHERE requester_id=$1 AND operation_type=$2 AND operation_id=$3',[session.accountId,type,input.operationId]);return r;
    });
    if(result.outcome==='failure')throw new TokenOperationError(input.operationId,result.data as {code:'RESOURCE_UNAVAILABLE'});return result.data;
  }
  create(session:Session,input:HttpDto<'CreateProject'>){return this.mutate(session,'createProject',input,async c=>{
    const p=(await c.query<ProjectRow>('INSERT INTO projects(id,owner_id,name) VALUES($1,$2,$3) RETURNING *',[randomUUID(),session.accountId,input.name.trim()])).rows[0]!;return view(p);
  });}
  rename(session:Session,id:string,input:HttpDto<'RenameProject'>){return this.mutate(session,'renameProject',{...input,id},async c=>{
    const p=await this.active(c,session,id);if(p.resource_revision!==input.expectedResourceRevision)throw new ValidationError('VERSION_CONFLICT');
    return view((await c.query<ProjectRow>('UPDATE projects SET name=$2,resource_revision=resource_revision+1,updated_at=clock_timestamp() WHERE id=$1 RETURNING *',[id,input.name.trim()])).rows[0]!);
  });}
  get(session:Session,id:string){return inTransaction(this.pool,async c=>{await this.sessions.authorizeFor(c,session,'normal');const p=await this.active(c,session,id);await this.sessions.authorizeFor(c,session,'normal');return view(p);});}
  private cursor(accountId:string,scope:string,time:string,id:string){const payload=Buffer.from(JSON.stringify({accountId,scope,time,id})).toString('base64url');return payload+'.'+createHmac('sha256',this.key).update(payload).digest('base64url');}
  private parseCursor(value:string,accountId:string,scope:string){
    try{const [payload,signature,...rest]=value.split('.');if(!payload||!signature||rest.length)throw new Error();const actual=Buffer.from(signature,'base64url'),expected=createHmac('sha256',this.key).update(payload).digest();if(actual.length!==expected.length||!timingSafeEqual(actual,expected))throw new Error();const p=JSON.parse(Buffer.from(payload,'base64url').toString());if(p.accountId!==accountId||p.scope!==scope||typeof p.time!=='string'||!Number.isFinite(Date.parse(p.time)))throw new Error();uuid(p.id);return {time:p.time as string,id:p.id as string};}catch{throw new ValidationError('INVALID_INPUT');}
  }
  list(session:Session,input:HttpDto<'Pagination'>){return inTransaction(this.pool,async c=>{
    await this.sessions.authorizeFor(c,session,'normal');const cursor=input.cursor?this.parseCursor(input.cursor,session.accountId,'projects'):null,limit=input.limit??25;
    const rows=(await c.query<ProjectRow>(`SELECT *,created_at::text AS cursor_time FROM projects WHERE owner_id=$1 AND state='active' AND ($2::timestamptz IS NULL OR (created_at,id)<($2::timestamptz,$3::uuid)) ORDER BY created_at DESC,id DESC LIMIT $4`,[session.accountId,cursor?.time??null,cursor?.id??null,limit+1])).rows;
    const items=rows.slice(0,limit),last=items.at(-1);await this.sessions.authorizeFor(c,session,'normal');return {items:items.map(view),nextCursor:rows.length>limit&&last?this.cursor(session.accountId,'projects',last.cursor_time,last.id):null};
  });}
  patterns(session:Session,projectId:string,input:HttpDto<'Pagination'>){return inTransaction(this.pool,async c=>{
    await this.sessions.authorizeFor(c,session,'normal');await this.active(c,session,projectId);const scope=`patterns:${projectId}`,cursor=input.cursor?this.parseCursor(input.cursor,session.accountId,scope):null,limit=input.limit??25;
    const rows=(await c.query<ProjectRow & {project_id:string;latest_version_id:string|null}>(`SELECT *,created_at::text AS cursor_time FROM patterns WHERE project_id=$1 AND owner_id=$2 AND state='active' AND ($3::timestamptz IS NULL OR (created_at,id)<($3::timestamptz,$4::uuid)) ORDER BY created_at DESC,id DESC LIMIT $5`,[projectId,session.accountId,cursor?.time??null,cursor?.id??null,limit+1])).rows;
    const items=rows.slice(0,limit),last=items.at(-1);await this.sessions.authorizeFor(c,session,'normal');return {items:items.map(p=>this.patternView(p)),nextCursor:rows.length>limit&&last?this.cursor(session.accountId,scope,last.cursor_time,last.id):null};
  });}
  private patternView(p:ProjectRow & {project_id:string;latest_version_id:string|null}){return {id:p.id,projectId:p.project_id,ownerId:p.owner_id,name:p.name,state:p.state,latestVersionId:p.latest_version_id,resourceRevision:p.resource_revision,trashedAt:p.trashed_at?.toISOString()??null,expiresAt:p.expires_at?.toISOString()??null};}
  pattern(session:Session,id:string){return inTransaction(this.pool,async c=>{
    await this.sessions.authorizeFor(c,session,'normal');uuid(id);const row=(await c.query<ProjectRow & {project_id:string;latest_version_id:string|null}>('SELECT * FROM patterns WHERE id=$1 AND owner_id=$2',[id,session.accountId])).rows[0];if(!row)throw new ValidationError('RESOURCE_UNAVAILABLE');await this.active(c,session,row.project_id);if(row.state!=='active')throw new ValidationError('RESOURCE_TRASHED');await this.sessions.authorizeFor(c,session,'normal');return this.patternView(row);
  });}
}


