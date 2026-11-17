import { open,readFile,mkdir,stat,realpath } from 'node:fs/promises';
import { dirname,join,extname,resolve } from 'node:path';
import { randomUUID,createHash } from 'node:crypto';
import { parseDocument,validateDocument } from '../../../../../packages/document/src/schema.js';
import type { PatternDocument } from '../../../../../packages/document/src/schema.js';
import { revisionId } from '../../../../../packages/document/src/revision.js';
import { writeEvidence,type SaveIntent } from './save-journal.js';

export class LocalDocumentError extends Error {constructor(readonly code:string){super(code);}}
export const sha256=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
export interface FileIdentity {path:string;device:string;inode:string;created:string;hash:string}
export interface ReplacementAdapter {
  /** Must reject network/synchronized paths and unsupported filesystems. */
  assertSupported(path:string):Promise<void>;
  volume?(path:string):Promise<string>;
  assertWritable?(path:string):Promise<void>;
  replace(destination:string,temporary:string,backup:string):Promise<void>;
  create(destination:string,temporary:string):Promise<void>;
  flush(path:string):Promise<void>;
}
export async function identity(path:string):Promise<FileIdentity|null>{
  try{const canonical=await realpath(path),s=await stat(canonical,{bigint:true});if(!s.isFile())throw new LocalDocumentError('ACCESS_DENIED');return {path:canonical,device:String(s.dev),inode:String(s.ino),created:String(s.birthtimeNs),hash:sha256(await readFile(canonical))};}
  catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return null;throw e;}
}
const same=(a:FileIdentity|null,b:FileIdentity|null)=>JSON.stringify(a)===JSON.stringify(b);
export async function exclusiveWrite(path:string,bytes:Uint8Array):Promise<void>{
  const handle=await open(path,'wx',0o600);try{await handle.writeFile(bytes);await handle.sync();}finally{await handle.close();}
  if(sha256(await readFile(path))!==sha256(bytes))throw new LocalDocumentError('SAVE_UNCONFIRMED');
}
export interface SaveRequest {path:string;snapshot:PatternDocument;expected:FileIdentity|null;blockedPath?:string}
export interface SaveResult {snapshot:PatternDocument;identity:FileIdentity;saveId:string}
/** Main-only writer. Recovery/journals are independent of the destination USB.
 * The native Windows adapter is mandatory; there is no unlink/rename fallback.
 */
export class DocumentWriter {
  private tails=new Map<string,Promise<unknown>>();
  constructor(private readonly recoveryDirectory:string,private readonly adapter:ReplacementAdapter){}
  async save(request:SaveRequest):Promise<SaveResult>{
    const input=structuredClone(request),path=resolve(input.path),key=path.toLowerCase();
    const previous=this.tails.get(key)??Promise.resolve();
    const result=previous.catch(()=>undefined).then(()=>this.write({...input,path}));this.tails.set(key,result);
    try{return await result;}finally{if(this.tails.get(key)===result)this.tails.delete(key);}
  }
  private async write(request:SaveRequest):Promise<SaveResult>{
    const {path,expected}=request;if(extname(path).toLowerCase()!=='.patron')throw new LocalDocumentError('DOCUMENT_INVALID');
    validateDocument(request.snapshot);await this.adapter.assertSupported(path);
    await this.adapter.assertWritable?.(path);
    const volume=await this.adapter.volume?.(path)??null;
    const checkVolume=async()=>{await this.adapter.assertSupported(path);if(volume!==null&&await this.adapter.volume?.(path)!==volume)throw new LocalDocumentError('STORAGE_UNAVAILABLE');};
    if(request.blockedPath){
      const blockedPath=request.blockedPath,target=await realpath(path).catch(()=>resolve(path)),blocked=await realpath(blockedPath).catch(()=>resolve(blockedPath));
      const targetIdentity=await identity(path),blockedIdentity=await identity(blockedPath);
      if(target.toLowerCase()===blocked.toLowerCase()||targetIdentity&&blockedIdentity&&targetIdentity.inode!=='0'&&targetIdentity.device===blockedIdentity.device&&targetIdentity.inode===blockedIdentity.inode)throw new LocalDocumentError('EXTERNAL_FILE_CHANGED');
    }
    const before=await identity(path);if(!same(before,expected))throw new LocalDocumentError('EXTERNAL_FILE_CHANGED');
    const snapshot={...request.snapshot,revisionId:revisionId(request.snapshot)},bytes=Buffer.from(JSON.stringify(snapshot));
    // FR-284 limits published files only; local documents have no account quota.
    const saveId=randomUUID(),temporary=join(dirname(path),`.patron-${saveId}.tmp`),nativeBackup=join(dirname(path),`.patron-${saveId}.bak`);
    await mkdir(this.recoveryDirectory,{recursive:true,mode:0o700});
    const independentBackup=join(this.recoveryDirectory,`${saveId}.previous.patron`),intent=join(this.recoveryDirectory,`${saveId}.intent.json`);
    await exclusiveWrite(temporary,bytes);parseDocument((await readFile(temporary)).toString('utf8'));
    await exclusiveWrite(join(this.recoveryDirectory,`${saveId}.next.patron`),bytes);
    if(before){const old=await readFile(path);if(sha256(old)!==before.hash)throw new LocalDocumentError('EXTERNAL_FILE_CHANGED');await exclusiveWrite(independentBackup,old);}
    const record:SaveIntent={version:2,saveId,path,volume,previousHash:before?.hash??null,newHash:sha256(bytes),revisionId:snapshot.revisionId,documentId:snapshot.documentId,savedAt:new Date().toISOString()};
    await writeEvidence(intent,record);
    await checkVolume();
    if(!same(await identity(path),before))throw new LocalDocumentError('EXTERNAL_FILE_CHANGED');
    try{if(before)await this.adapter.replace(path,temporary,nativeBackup);else await this.adapter.create(path,temporary);}
    catch{/* A failed ReplaceFileW may already have changed names; reconcile below. */}
    await checkVolume();
    const after=await identity(path).catch(()=>null);
    if(!after||after.hash!==sha256(bytes))throw new LocalDocumentError('SAVE_UNCONFIRMED');
    await this.adapter.flush(path);
    await checkVolume();
    const confirmed=await identity(path);if(!confirmed||confirmed.hash!==after.hash||confirmed.device!==after.device||confirmed.inode!==after.inode)throw new LocalDocumentError('SAVE_UNCONFIRMED');
    await writeEvidence(join(this.recoveryDirectory,`${saveId}.confirmed.json`),{saveId,newHash:confirmed.hash,revisionId:snapshot.revisionId});
    return {snapshot,identity:confirmed,saveId};
  }
}

