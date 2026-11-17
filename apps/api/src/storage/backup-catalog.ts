import {mkdir,open,readdir,readFile,unlink,lstat,rmdir,realpath} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {uuid} from '../../../../packages/contracts/src/validation.js';
import {expiredCopies,validateCopyInventory,type RecoverableCopy} from './backup-policy.js';
import type {BackupManifest} from './backup-coordinator.js';
export interface BackupEntry extends RecoverableCopy {verified:boolean;target?:string}
const digest=(value:string)=>createHash('sha256').update(value).digest('hex');
/** Exclusive, append-only catalog. A crashed lock requires explicit operator
 * reconciliation; never guess that another owner or restore has stopped. */
export class BackupCatalog {
 private tail:Promise<unknown>=Promise.resolve();
 constructor(private readonly directory:string){}
 private async readState():Promise<BackupEntry[]>{
  const directory=join(this.directory,'catalog');await mkdir(directory,{recursive:true,mode:0o700});
  const files=(await readdir(directory)).sort();let previous:string|null=null,entries:BackupEntry[]=[];
  for(const [i,file] of files.entries()){
   if(file!==String(i+1).padStart(12,'0')+'.json')throw Error('BACKUP_CATALOG_DAMAGED');
   const envelope=JSON.parse(await readFile(join(directory,file),'utf8')) as {payload:string;hash:string};
   if(digest(envelope.payload)!==envelope.hash)throw Error('BACKUP_CATALOG_DAMAGED');
   const value=JSON.parse(envelope.payload) as {previous:string|null;entries:BackupEntry[]};
   if(value.previous!==previous)throw Error('BACKUP_CATALOG_DAMAGED');validateCopyInventory(value.entries);
   for(const e of value.entries){uuid(e.id);if(typeof e.verified!=='boolean'||e.target!==undefined&&!/^patron-backup-[a-f0-9-]{36}$/.test(e.target))throw Error('BACKUP_CATALOG_DAMAGED');}
   entries=value.entries;previous=envelope.hash;
  }
  const known=new Set(entries.filter(e=>e.kind==='backup').map(e=>e.id));
  const present=await readdir(this.directory);
  if(present.some(name=>/^[a-f0-9-]{36}$/.test(name)&&!known.has(name)))throw Error('BACKUP_CATALOG_UNTRACKED_COPY');
  if(entries.some(e=>e.kind==='backup'&&e.state==='deleted'&&present.includes(e.id)))throw Error('BACKUP_DELETED_COPY_REAPPEARED');
  return entries;
 }
 private async write(entries:BackupEntry[]){
  const directory=join(this.directory,'catalog'),files=(await readdir(directory)).sort(),last=files.at(-1);
  const previous=last?(JSON.parse(await readFile(join(directory,last),'utf8')) as {hash:string}).hash:null;
  const payload=JSON.stringify({previous,entries}),handle=await open(join(directory,String(files.length+1).padStart(12,'0')+'.json'),'wx',0o600);
  try{await handle.writeFile(JSON.stringify({payload,hash:digest(payload)}));await handle.sync();}finally{await handle.close();}
  if(JSON.stringify(await this.readState())!==JSON.stringify(entries))throw Error('BACKUP_CATALOG_WRITE_UNCONFIRMED');
 }
 private exclusive<T>(work:(entries:BackupEntry[])=>Promise<T>){
  const next=this.tail.catch(()=>{}).then(async()=>{
   await mkdir(this.directory,{recursive:true,mode:0o700});const path=join(this.directory,'catalog.lock'),lock=await open(path,'wx',0o600);
   try{return await work(await this.readState());}finally{await lock.close();await unlink(path);}
  });this.tail=next;return next;
 }
 read(){return this.exclusive(async entries=>structuredClone(entries));}
 /** Keep restore registrations and backup reservations excluded throughout
  * evidence maintenance; a detached inventory snapshot is not sufficient. */
 withInventory<T>(work:(entries:readonly BackupEntry[])=>Promise<T>){return this.exclusive(entries=>work(structuredClone(entries)));}
 reserve(m:BackupManifest){return this.exclusive(async entries=>{
  uuid(m.backupId);const entry:BackupEntry={id:m.backupId,kind:'backup',capturedAt:m.capturedAt,watermark:{...m.watermark},state:'recoverable',verified:false};validateCopyInventory([entry]);
  if(entries.some(e=>e.id===entry.id))throw Error('BACKUP_ID_REUSED');await this.write([...entries,entry]);
 });}
 complete(id:string){return this.exclusive(async entries=>{const e=entries.find(e=>e.id===id&&e.state==='recoverable');if(!e)throw Error('BACKUP_NOT_REGISTERED');e.verified=true;await this.write(entries);});}
 copy(sourceId:string,id:string,kind:'restore'|'temporary',target:string,now:number){return this.exclusive(async entries=>{
  uuid(id);const source=entries.find(e=>e.id===sourceId&&e.state==='recoverable'&&e.verified);
  if(!source||expiredCopies([source],now).length||entries.some(e=>e.id===id)||!/^patron-backup-[a-f0-9-]{36}$/.test(target))throw Error('BACKUP_NOT_RECOVERABLE');
  await this.write([...entries,{...source,id,kind,target,watermark:{...source.watermark}}]);
 });}
 clean(now:number,retire:(entry:BackupEntry)=>Promise<void>){return this.exclusive(async entries=>{
  for(const expired of expiredCopies(entries,now)){
   const entry=entries.find(e=>e.id===expired.id)!;
   if(entry.state!=='deleting'){entry.state='deleting';await this.write(entries);}
   await retire(structuredClone(entry)); // failure keeps a durable deletion intent
   entry.state='deleted';await this.write(entries);
  }
 });}
}
/** Fixed known files only, no recursive traversal; refuse links or unknown
 * content. Missing files are compatible with a partially completed cleanup. */
export async function removeLocalBackup(root:string,id:string){
 uuid(id);const absolute=await realpath(root),path=resolve(absolute,id);
 let stat;try{stat=await lstat(path);}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return;throw e;}
 if(stat.isSymbolicLink()||!stat.isDirectory()||await realpath(path)!==path)throw Error('BACKUP_PATH_UNSAFE');
 const files=await readdir(path);if(files.some(f=>!['database.dump','roles.sql','manifest.json'].includes(f)))throw Error('BACKUP_PATH_UNSAFE');
 for(const file of files){const p=join(path,file),s=await lstat(p);if(!s.isFile()||s.isSymbolicLink())throw Error('BACKUP_PATH_UNSAFE');}
 for(const file of files)await unlink(join(path,file));await rmdir(path);
}
