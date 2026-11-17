import { Controller,Get,Post,Delete,Inject,Optional,Req,Param,HttpCode } from '@nestjs/common';
import { PurgeService } from './purge.service.js';
import { ContractRoute } from '../http/access.js';
import type { Credential } from '../http/access.js';
import { TrashService } from './trash.service.js';
import { DeletionService } from '../account/deletion.service.js';
import type { HttpDto } from '../../../../packages/contracts/src/http-dto.js';
import { ValidationError } from '../../../../packages/contracts/src/validation.js';
interface Input<B=unknown,Q=unknown>{contractCredential?:Credential;contractInput:{body:B;query:Q}}
const credential=(r:Input)=>{if(r.contractCredential?.kind!=='session')throw new ValidationError('SESSION_REQUIRED');return r.contractCredential;};
@Controller()
export class TrashController {
  constructor(@Inject(TrashService) private readonly trash:TrashService,@Optional() @Inject(DeletionService) private readonly deletion?:DeletionService,@Optional() @Inject(PurgeService) private readonly purges?:PurgeService){}
  @Get('destructive-scope') @ContractRoute('destructiveScope')
  scope(@Req() r:Input<unknown,HttpDto<'ScopeQuery'>>){const s=credential(r),input=r.contractInput.query;if(input.kind==='account'){if(!this.deletion)throw new ValidationError('RESOURCE_UNAVAILABLE');return this.deletion.scope(s,input);}return this.trash.scope(s,input);}
  @Get('trash') @ContractRoute('trash') list(@Req() r:Input<unknown,HttpDto<'Pagination'>>){return this.trash.list(credential(r),r.contractInput.query);}
  @Post('projects/:id/trash') @HttpCode(200) @ContractRoute('trashProject') project(@Req() r:Input<HttpDto<'TrashResource'>>,@Param('id') id:string){return this.trash.trash(credential(r),'project',id,r.contractInput.body);}
  @Post('patterns/:id/trash') @HttpCode(200) @ContractRoute('trashPattern') pattern(@Req() r:Input<HttpDto<'TrashResource'>>,@Param('id') id:string){return this.trash.trash(credential(r),'pattern',id,r.contractInput.body);}
  @Post('trash/:kind/:id/restore') @HttpCode(200) @ContractRoute('restore') restore(@Req() r:Input<HttpDto<'RestoreResource'>>,@Param('kind') kind:string,@Param('id') id:string){if(kind!=='project'&&kind!=='pattern')throw new ValidationError('INVALID_INPUT');return this.trash.restore(credential(r),kind,id,r.contractInput.body);}
  @Delete('trash/:kind/:id') @HttpCode(200) @ContractRoute('purge') purge(@Req() r:Input<HttpDto<'PurgeResource'>>,@Param('kind') kind:string,@Param('id') id:string){if(kind!=='project'&&kind!=='pattern')throw new ValidationError('INVALID_INPUT');if(!this.purges)throw new ValidationError('RESOURCE_UNAVAILABLE');return this.purges.request(credential(r),kind,id,r.contractInput.body);}
}
