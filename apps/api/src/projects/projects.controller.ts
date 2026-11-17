import { Controller,Get,Post,Patch,Req,Param,Inject } from '@nestjs/common';
import { ProjectsService } from './projects.service.js';
import { ContractRoute } from '../http/access.js';
import type { Credential } from '../http/access.js';
import type { HttpDto } from '../../../../packages/contracts/src/http-dto.js';
import { ValidationError } from '../../../../packages/contracts/src/validation.js';
interface Input<B=unknown>{contractCredential?:Credential;contractInput:{body:B;query:HttpDto<'Pagination'>}}
const credential=(r:Input)=>{if(r.contractCredential?.kind!=='session')throw new ValidationError('SESSION_REQUIRED');return r.contractCredential;};
@Controller()
export class ProjectsController {
  constructor(@Inject(ProjectsService) private readonly projects:ProjectsService){}
  @Get('projects') @ContractRoute('projects') list(@Req() r:Input){return this.projects.list(credential(r),r.contractInput.query);}
  @Post('projects') @ContractRoute('createProject') create(@Req() r:Input<HttpDto<'CreateProject'>>){return this.projects.create(credential(r),r.contractInput.body);}
  @Get('projects/:id') @ContractRoute('project') get(@Req() r:Input,@Param('id') id:string){return this.projects.get(credential(r),id);}
  @Patch('projects/:id') @ContractRoute('renameProject') rename(@Req() r:Input<HttpDto<'RenameProject'>>,@Param('id') id:string){return this.projects.rename(credential(r),id,r.contractInput.body);}
  @Get('projects/:id/patterns') @ContractRoute('patterns') patterns(@Req() r:Input,@Param('id') id:string){return this.projects.patterns(credential(r),id,r.contractInput.query);}
  @Get('patterns/:id') @ContractRoute('pattern') pattern(@Req() r:Input,@Param('id') id:string){return this.projects.pattern(credential(r),id);}
  @Get('patterns/:id/publication-status') @ContractRoute('publicationStatus') publicationStatus(@Req() r:Input,@Param('id') id:string){return this.projects.publicationStatus(credential(r),id);}
}
