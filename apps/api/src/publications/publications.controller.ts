import { Controller,Post,Put,Get,Req,Param,Inject,HttpCode,Optional,Res } from '@nestjs/common';
import type { IncomingMessage } from 'node:http';
import { StagingService } from './staging.service.js';
import { ContractRoute } from '../http/access.js';
import type { Credential } from '../http/access.js';
import type { HttpDto } from '../../../../packages/contracts/src/http-dto.js';
import { ValidationError } from '../../../../packages/contracts/src/validation.js';
import { CommitService } from './commit.service.js';
import { PublicationJobs } from './publication-jobs.js';
type Input=IncomingMessage&{contractCredential?:Credential;contractInput:{body:HttpDto<'BeginPublication'>}};
const credential=(r:Input)=>{if(r.contractCredential?.kind!=='session')throw new ValidationError('SESSION_REQUIRED');return r.contractCredential;};
@Controller()
export class PublicationsController {
  constructor(@Inject(StagingService) private readonly staging:StagingService,@Inject(CommitService) private readonly commits:CommitService,@Optional() @Inject(PublicationJobs) private readonly jobs?:PublicationJobs){}
  @Post('publications/:id/commit') @ContractRoute('commitPublication')
  async commit(@Req() r:Input&{contractInput:{body:HttpDto<'CommitPublication'>}},@Param('id') id:string,@Res({passthrough:true}) reply:{status(code:number):void}){
    if(!this.jobs)throw new ValidationError('INTERNAL_ERROR');const result=await this.commits.request(credential(r),id,r.contractInput.body);reply.status(result.state==='pending'?202:200);void this.jobs.run().catch(()=>undefined);return result;
  }
  @Post('publications') @ContractRoute('beginPublication') begin(@Req() r:Input){return this.staging.begin(credential(r),r.contractInput.body);}
  @Post('publications/:id/abandon') @HttpCode(200) @ContractRoute('abandonPublication')
  abandon(@Req() r:Input,@Param('id') id:string){return this.staging.abandon(credential(r),id,r.contractInput.body);}
  @Get('publications/:id') @ContractRoute('publication') get(@Req() r:Input,@Param('id') id:string){return this.staging.get(credential(r),id);}
  @Put('publications/:id/files/:fileId') @HttpCode(200) @ContractRoute('upload')
  async upload(@Req() r:Input,@Param('id') id:string,@Param('fileId') fileId:string){
    const s=credential(r);await this.staging.get(s,id);
    const length=r.headers['content-length'],checksum=r.headers['x-content-sha256'];
    if(typeof length!=='string'||!/^\d+$/.test(length)||typeof checksum!=='string'||!/^[a-f0-9]{64}$/.test(checksum))throw new ValidationError('INVALID_INPUT');
    if(!Number.isSafeInteger(Number(length))||Number(length)>100000000)throw new ValidationError('FILE_TOO_LARGE');
    return this.staging.uploadStream(s,id,fileId,r,{bytes:Number(length),sha256:checksum});
  }
}
