import {SESv2Client,SendEmailCommand} from '@aws-sdk/client-sesv2';
import type {MailMessage,MailTransport} from './mail-transport.js';

export class SesMailTransport implements MailTransport {
 constructor(private readonly client:SESv2Client,private readonly sender:string){
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sender))throw Error('MAIL_SENDER_INVALID');
 }
 async send(message:MailMessage):Promise<void>{
  await this.client.send(new SendEmailCommand({FromEmailAddress:this.sender,Destination:{ToAddresses:[message.recipient]},Content:{Simple:{Subject:{Data:message.subject,Charset:'UTF-8'},Body:{Text:{Data:message.text,Charset:'UTF-8'}}}}}));
 }
}
