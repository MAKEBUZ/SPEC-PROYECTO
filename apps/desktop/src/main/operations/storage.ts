import { mkdir,readdir,readFile,rm,lstat } from 'node:fs/promises';
import { join,resolve,sep } from 'node:path';
import type { JournalStorage } from '../../../../../packages/document/src/operations/journal.js';
import { journalHash,retiredGeneration } from '../../../../../packages/document/src/operations/journal.js';
import { exclusiveWrite } from '../documents/save.js';
const valid=(key:string)=>{if(!/^[a-f0-9-]{36}_[a-f0-9-]{36}$/.test(key))throw new Error('JOURNAL_KEY_INVALID');};
/** Only the single Electron main process owns this local directory. */
export class DesktopJournalStorage implements JournalStorage {
  constructor(private readonly directory:string){}
  async keys(){await mkdir(this.directory,{recursive:true,mode:0o700});return (await readdir(this.directory,{withFileTypes:true})).filter(e=>e.isDirectory()&&/^[a-f0-9-]{36}_[a-f0-9-]{36}$/.test(e.name)).map(e=>e.name);}
  private async retired(key:string){const digest=await journalHash(key);try{const value=await readFile(join(this.directory,'.retired',digest),'utf8');if(value!==digest)throw Error('JOURNAL_DAMAGED');return true;}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return false;throw e;}}
  async read(key:string){valid(key);if(await this.retired(key))return [await retiredGeneration(key)];const dir=join(this.directory,key);let files:string[];try{files=await readdir(dir);}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return [];throw e;}
    if(files.some(f=>f!=='.copies'&&!/^\d{10}\.json$/.test(f)))throw new Error('JOURNAL_DAMAGED');
    files=files.filter(f=>f!=='.copies');
    const copies=join(dir,'.copies');let backups:string[]=[];
    try{if((await lstat(copies)).isSymbolicLink())throw Error('JOURNAL_DAMAGED');backups=await readdir(copies);}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
    if(backups.some(f=>!/^\d{10}\.json(?:\.digest)?$/.test(f)))throw Error('JOURNAL_DAMAGED');
    files=[...new Set([...files,...backups.map(f=>f.replace(/\.digest$/,''))])].sort();
    for(const [i,f] of files.entries())if(f!==`${String(i+1).padStart(10,'0')}.json`)throw new Error('JOURNAL_DAMAGED');
    return Promise.all(files.map(async f=>{
      const read=async(path:string)=>{try{return await readFile(path,'utf8');}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return '';throw e;}};
      const primary=await read(join(dir,f)),digest=await read(join(copies,f+'.digest'));
      if(!digest){if(backups.includes(f)||backups.includes(f+'.digest'))throw Error('JOURNAL_DAMAGED');return primary;}
      if(!/^[a-f0-9]{64}$/.test(digest))throw Error('JOURNAL_DAMAGED');
      if(await journalHash(primary)===digest)return primary;
      const backup=await read(join(copies,f));if(await journalHash(backup)!==digest)throw Error('JOURNAL_DAMAGED');return backup;
    }));
  }
  async append(key:string,expected:readonly string[],encoded:string){valid(key);if(await this.retired(key)||JSON.stringify(await this.read(key))!==JSON.stringify(expected))throw new Error('JOURNAL_CONFLICT');const dir=join(this.directory,key),copies=join(dir,'.copies'),name=`${String(expected.length+1).padStart(10,'0')}.json`;await mkdir(copies,{recursive:true,mode:0o700});await exclusiveWrite(join(copies,name+'.digest'),Buffer.from(await journalHash(encoded)));await exclusiveWrite(join(dir,name),Buffer.from(encoded));await exclusiveWrite(join(copies,name),Buffer.from(encoded));}
  async compact(key:string){
    valid(key);const records=await this.read(key),last=records.at(-1);if(!last)throw Error('JOURNAL_COMPACTION_FORBIDDEN');
    const envelope=JSON.parse(last);if(await journalHash(envelope.payload)!==envelope.checksum||JSON.parse(envelope.payload).value!==null)throw Error('JOURNAL_COMPACTION_FORBIDDEN');
    const digest=await journalHash(key),markers=join(this.directory,'.retired');await mkdir(markers,{recursive:true,mode:0o700});
    if(!await this.retired(key))await exclusiveWrite(join(markers,digest),Buffer.from(digest));
    if(!await this.retired(key))throw Error('JOURNAL_COMPACTION_UNCONFIRMED');
    const root=resolve(this.directory),target=resolve(root,key);
    if(!target.startsWith(root+sep))throw Error('JOURNAL_KEY_INVALID');
    try{if((await lstat(target)).isSymbolicLink())throw Error('JOURNAL_DAMAGED');await rm(target,{recursive:true,force:true});}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
  }
}
