import { Controller,Get,Inject,Param,Req } from '@nestjs/common';
import { createHmac,timingSafeEqual } from 'node:crypto';
import type { Pool,PoolClient } from 'pg';
import { SessionService } from '../auth/session.service.js';
import { inTransaction } from '../db/transaction.js';
import { ContractRoute } from '../http/access.js';
import type { Credential } from '../http/access.js';
import { ValidationError,uuid } from '../../../../packages/contracts/src/validation.js';
import type { HttpDto } from '../../../../packages/contracts/src/http-dto.js';
import { fileViews } from '../files/file-view.js';
export type LibrarySession=Extract<Credential,{kind:'session'}>;
export class LibraryService {
  constructor(private readonly pool:Pool,private readonly sessions:SessionService,private readonly key:Buffer){}
  async active(c:PoolClient,s:LibrarySession,patternId:string){
    uuid(patternId);const row=(await c.query('SELECT p.owner_id,p.state,pr.state AS project_state FROM patterns p JOIN projects pr ON pr.id=p.project_id WHERE p.id=$1 AND p.owner_id=$2',[patternId,s.accountId])).rows[0];
    if(!row)throw new ValidationError('RESOURCE_UNAVAILABLE');if(row.state!=='active'||row.project_state!=='active')throw new ValidationError('RESOURCE_TRASHED');
  }
  private sign(payload:string){return createHmac('sha256',this.key).update(payload).digest();}
  private cursor(s:LibrarySession,id:string,ordinal:string){const p=Buffer.from(JSON.stringify([s.accountId,id,ordinal])).toString('base64url');return `${p}.${this.sign(p).toString('base64url')}`;}
  private parse(s:LibrarySession,id:string,value:string){try{const [p,sig,...rest]=value.split('.');if(!p||!sig||rest.length)throw new Error();const b=Buffer.from(sig,'base64url'),expected=this.sign(p);if(b.length!==expected.length||!timingSafeEqual(b,expected))throw new Error();const v=JSON.parse(Buffer.from(p,'base64url').toString());if(v[0]!==s.accountId||v[1]!==id||typeof v[2]!=='string'||!/^\d+$/.test(v[2]))throw new Error();return v[2] as string;}catch{throw new ValidationError('INVALID_INPUT');}}
  versions(s:LibrarySession,id:string,input:HttpDto<'Pagination'>){return inTransaction(this.pool,async c=>{
    await this.sessions.authorizeFor(c,s,'normal');await this.active(c,s,id);const ordinal=input.cursor?this.parse(s,id,input.cursor):null,limit=input.limit??25;
    const rows=(await c.query('SELECT * FROM versions WHERE pattern_id=$1 AND ($2::bigint IS NULL OR ordinal<$2::bigint) ORDER BY ordinal DESC LIMIT $3',[id,ordinal,limit+1])).rows,items=[];
    for(const v of rows.slice(0,limit))items.push({id:v.id,patternId:v.pattern_id,ordinal:Number(v.ordinal),authorId:v.author_id,createdAt:v.created_at.toISOString(),localRevisionId:v.local_revision_id,commitOperationId:v.commit_operation_id,files:await fileViews(c,v.id as string)});
    await this.sessions.authorizeFor(c,s,'normal');await this.active(c,s,id);return {items,nextCursor:rows.length>limit?this.cursor(s,id,rows[limit-1]!.ordinal as string):null};
  });}
  files(s:LibrarySession,id:string){return inTransaction(this.pool,async c=>{
    uuid(id);await this.sessions.authorizeFor(c,s,'normal');const v=(await c.query('SELECT pattern_id FROM versions WHERE id=$1',[id])).rows[0];if(!v)throw new ValidationError('RESOURCE_UNAVAILABLE');await this.active(c,s,v.pattern_id as string);const items=await fileViews(c,id);await this.sessions.authorizeFor(c,s,'normal');await this.active(c,s,v.pattern_id as string);return {items,nextCursor:null};
  });}
}
interface Input {contractCredential?:Credential;contractInput:{query:HttpDto<'Pagination'>}}
export const libraryCredential=(r:{contractCredential?:Credential})=>{if(r.contractCredential?.kind!=='session')throw new ValidationError('SESSION_REQUIRED');return r.contractCredential;};
@Controller()
export class LibraryController {
  constructor(@Inject(LibraryService) private readonly library:LibraryService){}
  @Get('patterns/:id/versions') @ContractRoute('versions') versions(@Req() r:Input,@Param('id') id:string){return this.library.versions(libraryCredential(r),id,r.contractInput.query);}
  @Get('versions/:id/files') @ContractRoute('files') files(@Req() r:Input,@Param('id') id:string){return this.library.files(libraryCredential(r),id);}
}
