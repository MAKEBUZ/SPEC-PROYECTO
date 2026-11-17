import { Controller,Get,Req,Param,Inject } from '@nestjs/common';
import type { Pool } from 'pg';
import { SessionService } from '../auth/session.service.js';
import { ContractRoute } from '../http/access.js';
import type { Credential } from '../http/access.js';
import { inTransaction } from '../db/transaction.js';
import { ValidationError,uuid } from '../../../../packages/contracts/src/validation.js';
interface Input {contractCredential?:Credential;contractInput:{query:{operationType:string}}}
export class OperationsService {
  constructor(private readonly pool:Pool,private readonly sessions:SessionService){}
  get(s:Extract<Credential,{kind:'session'}>,id:string,type:string){return inTransaction(this.pool,async c=>{
    uuid(id);await this.sessions.authorizeFor(c,s,'normal');
    const rows=(await c.query<{requester_id:string;state:string;outcome:string|null;confirmed_at:Date|null;data:Record<string,unknown>|null;display_name:string|null;actor_exists:boolean}>(`SELECT o.*,a.display_name,(a.id IS NOT NULL) AS actor_exists FROM operation_results o LEFT JOIN accounts a ON a.id=o.requester_id WHERE o.operation_id=$1 AND o.operation_type=$2 AND (o.requester_id=$3 OR o.historical_owner_id=$3) ORDER BY (o.requester_id=$3) DESC LIMIT 2`,[id,type,s.accountId])).rows;
    const row=rows[0];if(!row||rows.length>1&&row.requester_id!==s.accountId)throw new ValidationError('OPERATION_RESULT_UNAVAILABLE');
    const refs:{kind:string;id:string}[]=[],data=row.data??{};
    for(const [key,kind] of [['patternId','pattern'],['versionId','version']] as const)if(typeof data[key]==='string'){uuid(data[key]);refs.push({kind,id:data[key]});}
    if(type==='beginPublication'&&typeof data.publicationId==='string'){uuid(data.publicationId);refs.push({kind:'publication',id:data.publicationId});}
    if(['createProject','renameProject'].includes(type)&&typeof data.id==='string'){uuid(data.id);refs.push({kind:'project',id:data.id});}
    await this.sessions.authorizeFor(c,s,'normal');
    const common={operationId:id,operationType:type,authorizedResourceRefs:refs,actorLabel:row.actor_exists?row.display_name||'Propietario':'Cuenta eliminada'};
    return row.state==='pending'?{...common,state:'pending'}:{...common,state:'resolved',outcome:row.outcome,confirmedAt:row.confirmed_at!.toISOString(),...typeof data.code==='string'?{code:data.code}:{}};
  });}
}
@Controller()
export class OperationsController {
  constructor(@Inject(OperationsService) private readonly operations:OperationsService){}
  @Get('operations/:operationId') @ContractRoute('operation')
  get(@Req() r:Input,@Param('operationId') id:string){if(r.contractCredential?.kind!=='session')throw new ValidationError('SESSION_REQUIRED');return this.operations.get(r.contractCredential,id,r.contractInput.query.operationType);}
}
