import {mkdir,readdir,readFile,rm,lstat,open} from 'node:fs/promises';
import {join,resolve,sep} from 'node:path';
import {uuid} from '../../../../../packages/contracts/src/validation.js';
import {type AccountHistory} from '../../../../../packages/document/src/operations/closed.js';
import {encodeHistory,decodeHistory,assertHistoryProgress,RECOVERY_NOTICE} from '../../../../../packages/document/src/operations/history-storage.js';
import {exclusiveWrite} from '../documents/save.js';

/** Main-process owned directory, per-account isolation. Only the highest
 * generation can be recovered; no fallback through later expiry/removal. */
export class DesktopHistoryStorage {
 private tail:Promise<unknown>=Promise.resolve();private isolated=false;private interruptedDigest:string|undefined;
 private readonly directory:string;
 constructor(root:string,private readonly accountId:string,private readonly write=exclusiveWrite){uuid(accountId);this.directory=resolve(root,accountId);}
 get notice(){return this.isolated?RECOVERY_NOTICE:null;}
 private serial<T>(fn:()=>Promise<T>){const next=this.tail.catch(()=>undefined).then(fn);this.tail=next;return next;}
 private async generations(){
  await mkdir(this.directory,{recursive:true,mode:0o700});
  if((await lstat(this.directory)).isSymbolicLink())throw Error('HISTORY_RECOVERY_UNAVAILABLE');
  const names=(await readdir(this.directory)).sort();if(names.some(n=>!/^\d{12}$/.test(n)))throw Error('HISTORY_RECOVERY_UNAVAILABLE');return names;
 }
 private async read(){
  const names=await this.generations(),last=names.at(-1);if(!last)return {names,state:undefined};
  const folder=join(this.directory,last);if((await lstat(folder)).isSymbolicLink())throw Error('HISTORY_RECOVERY_UNAVAILABLE');
  const read=async(name:string)=>{try{return await readFile(join(folder,name),'utf8');}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return '';throw e;}};
  const [digest,primary,backup]=await Promise.all([read('digest'),read('primary.json'),read('backup.json')]);
  const state=await decodeHistory({digest,primary,backup},this.accountId);return {names,state};
 }
 private async prune(names:string[]){
  for(const name of names){const target=resolve(this.directory,name);if(!target.startsWith(this.directory+sep)||!/^\d{12}$/.test(name)||(await lstat(target)).isSymbolicLink())throw Error('HISTORY_RECOVERY_UNAVAILABLE');await rm(target,{recursive:true});}
 }
 load():Promise<AccountHistory>{return this.serial(async()=>{
  try{const result=await this.read();if(!result.state)throw Error('HISTORY_NOT_FOUND');await this.prune(result.names.slice(0,-1));this.isolated=false;return result.state;}
  catch(e){this.isolated=(e as Error).message!=='HISTORY_NOT_FOUND';throw e;}
 });}
 save(input:AccountHistory):Promise<void>{const captured=structuredClone(input);return this.serial(async()=>{
  try{
   const snapshot=await encodeHistory(captured);if(captured.accountId!==this.accountId)throw Error('HISTORY_ROLLBACK');
   let previous:Awaited<ReturnType<DesktopHistoryStorage['read']>>;
   try{previous=await this.read();}catch(error){
    if(this.interruptedDigest!==snapshot.digest)throw error;
    // A failed write may have committed only the digest. Retry only the exact
    // in-memory value bound to that intent; never fill gaps from older states.
    const names=await this.generations(),last=names.at(-1);if(!last)throw error;
    const folder=join(this.directory,last);if((await lstat(folder)).isSymbolicLink()||await readFile(join(folder,'digest'),'utf8')!==snapshot.digest)throw error;
    for(const name of ['primary.json','backup.json']){
     const target=join(folder,name);try{if((await lstat(target)).isSymbolicLink())throw Error('HISTORY_RECOVERY_UNAVAILABLE');}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
     const handle=await open(target,'w',0o600);try{await handle.writeFile(snapshot.primary);await handle.sync();}finally{await handle.close();}
    }
    const checked=await this.read();if(JSON.stringify(checked.state)!==snapshot.primary)throw Error('HISTORY_SAVE_UNCONFIRMED');await this.prune(names.slice(0,-1));this.isolated=false;this.interruptedDigest=undefined;return;
   }
   assertHistoryProgress(previous.state,captured);
   const sequence=Number(previous.names.at(-1)??0)+1;if(sequence>999999999999)throw Error('HISTORY_SEQUENCE_EXHAUSTED');
   this.interruptedDigest=snapshot.digest;
   const folder=join(this.directory,String(sequence).padStart(12,'0'));await mkdir(folder,{mode:0o700});
   await this.write(join(folder,'digest'),Buffer.from(snapshot.digest));
   await this.write(join(folder,'primary.json'),Buffer.from(snapshot.primary));
   await this.write(join(folder,'backup.json'),Buffer.from(snapshot.backup));
   const verified=await this.read();if(JSON.stringify(verified.state)!==snapshot.primary)throw Error('HISTORY_SAVE_UNCONFIRMED');
   await this.prune(previous.names);this.isolated=false;this.interruptedDigest=undefined;
  }catch(e){if((e as Error).message==='HISTORY_RECOVERY_UNAVAILABLE')this.isolated=true;throw e;}
 });}
}
