import { Controller,Get,Req,Res } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { ContractRoute } from '../http/access.js';
@Controller()
export class TimeController {
  @Get('time') @ContractRoute('time')
  get(@Req() request:{contractInput:{query:{nonce:string}}},@Res({passthrough:true}) reply:{setHeader(name:string,value:string):void}){
    const serverReceivedAt=new Date().toISOString();reply.setHeader('Cache-Control','no-store');
    return {nonce:request.contractInput.query.nonce,responseId:randomUUID(),serverReceivedAt,serverSentAt:new Date().toISOString()};
  }
}
