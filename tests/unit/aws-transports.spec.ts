import {describe,it,expect,vi} from 'vitest';
import {Readable} from 'node:stream';
import {createHash} from 'node:crypto';
import {S3Client,PutObjectCommand,GetObjectCommand} from '@aws-sdk/client-s3';
import {SESv2Client} from '@aws-sdk/client-sesv2';
import {S3BlobStore} from '../../apps/api/src/storage/s3-blob-store.js';
import {SesMailTransport} from '../../apps/api/src/mail/ses-mail-transport.js';
const key='a'.repeat(64),bytes=Buffer.from('patronaje');
const expected={bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
function storage(existing?:Buffer){
 let stored=existing;const commands:unknown[]=[];
 const send=vi.fn(async(command:unknown)=>{
  commands.push(command);
  if(command instanceof PutObjectCommand){
   if(stored)throw Object.assign(new Error(),{name:'PreconditionFailed'});
   const chunks:Buffer[]=[];for await(const chunk of command.input.Body as AsyncIterable<Uint8Array>)chunks.push(Buffer.from(chunk));stored=Buffer.concat(chunks);return {};
  }
  if(command instanceof GetObjectCommand)return {Body:Readable.from([stored!])};
  throw Error('Unexpected command');
 });
 return {store:new S3BlobStore({send} as unknown as S3Client,'patronaje-test','847205414980'),send,commands};
}
describe('AWS transports',()=>{
 it('writes privately and conditionally, then verifies actual readback',async()=>{
  const f=storage();expect(await f.store.put(key,bytes)).toEqual(expected);
  expect((f.commands[0] as PutObjectCommand).input).toMatchObject({IfNoneMatch:'*',ServerSideEncryption:'AES256',ExpectedBucketOwner:'847205414980',Key:`objects/${key}`,ContentLength:bytes.length});
 });
 it('accepts an identical retry but rejects immutable key reuse',async()=>{
  expect(await storage(bytes).store.put(key,bytes)).toEqual(expected);
  await expect(storage(Buffer.from('different')).store.put(key,bytes)).rejects.toThrow('STORAGE_CONTENT_MISMATCH');
 });
 it('rejects corrupt streams before touching S3',async()=>{
  const f=storage();await expect(f.store.putStream(key,(async function*(){yield bytes;})(),{...expected,sha256:'0'.repeat(64)})).rejects.toThrow();expect(f.send).not.toHaveBeenCalled();
 });
 it('rejects untrusted paths before touching S3',async()=>{
  const f=storage();await expect(f.store.put('../secret',bytes)).rejects.toThrow('STORAGE_KEY_INVALID');expect(f.send).not.toHaveBeenCalled();
 });
 it('sends SES from the configured identity and propagates delivery failure',async()=>{
  const send=vi.fn().mockResolvedValue({MessageId:'accepted'});const mail=new SesMailTransport({send} as unknown as SESv2Client,'patronaje277353@gmail.com');
  await mail.send({recipient:'test@example.com',subject:'Verificación',text:'Enlace'});
  expect(send.mock.calls[0]![0].input).toMatchObject({FromEmailAddress:'patronaje277353@gmail.com',Destination:{ToAddresses:['test@example.com']}});
  send.mockRejectedValue(new Error('provider unavailable'));await expect(mail.send({recipient:'test@example.com',subject:'x',text:'x'})).rejects.toThrow();
 });
});
