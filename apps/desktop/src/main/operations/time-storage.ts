import { mkdir,readdir,readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { exclusiveWrite,sha256 } from '../documents/save.js';
import { newTimeCheck,validateStoredTimeCheck,type TimeCheckState } from '../../../../../packages/document/src/operations/time-check.js';

/** Main-process single-owner append-only storage. A damaged last generation
 * isolates the check; it cannot silently fall back to an earlier live attempt.
 * Directory must be on the app's local storage, not the document's USB volume. */
export class TimeCheckStorage {
  private tail:Promise<unknown>=Promise.resolve();
  constructor(private readonly directory:string){}
  private serial<T>(fn:()=>Promise<T>){const result=this.tail.catch(()=>undefined).then(fn);this.tail=result;return result;}
  private async read(){
    await mkdir(this.directory,{recursive:true,mode:0o700});
    const files=(await readdir(this.directory)).sort();let state=newTimeCheck(),previous:string|null=null;
    for(const [index,file] of files.entries()){
      if(file!==`${String(index+1).padStart(12,'0')}.json`)throw new Error('TIME_CHECK_DAMAGED');
      try{
        const envelope=JSON.parse(await readFile(join(this.directory,file),'utf8')) as {payload:string;checksum:string};
        if(typeof envelope.payload!=='string'||sha256(Buffer.from(envelope.payload))!==envelope.checksum)throw new Error();
        const generation=JSON.parse(envelope.payload) as {version:number;sequence:number;previous:string|null;state:unknown};
        if(generation.version!==1||generation.sequence!==index+1||generation.previous!==previous)throw new Error();
        state=validateStoredTimeCheck(generation.state);previous=envelope.checksum;
      }catch{throw new Error('TIME_CHECK_DAMAGED');}
    }
    return {state,previous,sequence:files.length};
  }
  load():Promise<TimeCheckState>{return this.serial(async()=>structuredClone((await this.read()).state));}
  save(input:TimeCheckState):Promise<void>{
    const captured=structuredClone(input);
    return this.serial(async()=>{
      const state=validateStoredTimeCheck(captured),old=await this.read(),sequence=old.sequence+1;
      const payload=JSON.stringify({version:1,sequence,previous:old.previous,state});
      await exclusiveWrite(join(this.directory,`${String(sequence).padStart(12,'0')}.json`),Buffer.from(JSON.stringify({payload,checksum:sha256(Buffer.from(payload))})));
      const actual=await this.read();
      if(actual.sequence!==sequence||JSON.stringify(actual.state)!==JSON.stringify(state))throw new Error('TIME_CHECK_SAVE_UNCONFIRMED');
    });
  }
}
