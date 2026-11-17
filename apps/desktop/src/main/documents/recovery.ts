import { mkdir,readdir,readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { validateDocument } from '../../../../../packages/document/src/schema.js';
import type { PatternDocument } from '../../../../../packages/document/src/schema.js';
import { uuid } from '../../../../../packages/contracts/src/validation.js';
import { exclusiveWrite,sha256,LocalDocumentError } from './save.js';
interface Generation {version:1;documentId:string;sequence:number;savedAt:string;kind:'snapshot'|'discard';snapshot:PatternDocument|null}
export interface RecoveryCandidate {id:string;documentId:string;savedAt:string;snapshot:PatternDocument}
/** Main controls this directory on local storage independently of USB targets.
 * Generations are immutable and verified; discard is durable evidence, not an
 * attempt to delete every older file before acknowledging the user's choice.
 */
export class RecoveryStore {
  private tail:Promise<unknown>=Promise.resolve();
  constructor(private readonly directory:string){}
  private serial<T>(fn:()=>Promise<T>):Promise<T>{const next=this.tail.catch(()=>undefined).then(fn);this.tail=next;return next;}
  private async entries(){
    await mkdir(this.directory,{recursive:true,mode:0o700});const found:{id:string;generation:Generation}[]=[],damaged:string[]=[];
    for(const file of await readdir(this.directory)){
      const match=/^([0-9a-f-]{36})-([0-9a-f-]{36})\.recovery\.json$/.exec(file);if(!match)continue;
      const documentId=match[1]!;
      try{uuid(documentId);const envelope=JSON.parse(await readFile(join(this.directory,file),'utf8')) as {payload:string;checksum:string};if(typeof envelope.payload!=='string'||sha256(Buffer.from(envelope.payload))!==envelope.checksum)throw new Error();
        const g=JSON.parse(envelope.payload) as Generation;
        if(g.version!==1||g.documentId!==documentId||!Number.isSafeInteger(g.sequence)||g.sequence<1||!Number.isFinite(Date.parse(g.savedAt))||!['snapshot','discard'].includes(g.kind))throw new Error();
        if(g.kind==='snapshot'){validateDocument(g.snapshot);if(g.snapshot!.documentId!==documentId)throw new Error();}else if(g.snapshot!==null)throw new Error();
        found.push({id:file,generation:g});
      }catch{damaged.push(documentId);}
    }
    const groups=new Map<string,number[]>();
    for(const {generation:g} of found){const sequence=groups.get(g.documentId)??[];sequence.push(g.sequence);groups.set(g.documentId,sequence);}
    for(const [id,sequence] of groups){sequence.sort((a,b)=>a-b);if(sequence.some((n,i)=>n!==i+1))damaged.push(id);}
    return {found,damaged};
  }
  private async append(documentId:string,snapshot:PatternDocument|null){
    uuid(documentId);const {found,damaged}=await this.entries();
    if(damaged.includes(documentId))throw new LocalDocumentError('RECOVERY_INVALID');
    const sequence=Math.max(0,...found.filter(v=>v.generation.documentId===documentId).map(v=>v.generation.sequence))+1;
    const generation:Generation={version:1,documentId,sequence,savedAt:new Date().toISOString(),kind:snapshot?'snapshot':'discard',snapshot};
    const payload=JSON.stringify(generation),id=`${documentId}-${randomUUID()}.recovery.json`;
    await exclusiveWrite(join(this.directory,id),Buffer.from(JSON.stringify({payload,checksum:sha256(Buffer.from(payload))})));return id;
  }
  capture(document:PatternDocument){const snapshot=structuredClone(validateDocument(document));return this.serial(()=>this.append(snapshot.documentId,snapshot));}
  inspect(){return this.serial(async()=>{
    const {found,damaged}=await this.entries(),latest=new Map<string,{id:string;generation:Generation}>();
    for(const item of found){const old=latest.get(item.generation.documentId);if(!old||old.generation.sequence<item.generation.sequence)latest.set(item.generation.documentId,item);else if(old.generation.sequence===item.generation.sequence)damaged.push(item.generation.documentId);}
    return {candidates:[...latest.values()].filter(v=>v.generation.kind==='snapshot'&&!damaged.includes(v.generation.documentId)).map(v=>({id:v.id,documentId:v.generation.documentId,savedAt:v.generation.savedAt,snapshot:structuredClone(v.generation.snapshot!)})),damaged:damaged.length>0};
  });}
  async restore(id:string,confirmed:boolean){if(!confirmed)throw new LocalDocumentError('RECOVERY_INVALID');const candidate=(await this.inspect()).candidates.find(c=>c.id===id);if(!candidate)throw new LocalDocumentError('RECOVERY_INVALID');return candidate.snapshot;}
  discard(id:string,confirmed:boolean){return this.serial(async()=>{if(!confirmed)throw new LocalDocumentError('RECOVERY_INVALID');const {found,damaged}=await this.entries(),entry=found.find(v=>v.id===id);if(!entry||entry.generation.kind!=='snapshot'||damaged.includes(entry.generation.documentId)||found.some(v=>v.generation.documentId===entry.generation.documentId&&v.generation.sequence>entry.generation.sequence))throw new LocalDocumentError('RECOVERY_INVALID');await this.append(entry.generation.documentId,null);});}
}
/** The 60s interval is a target; failures are reported and never publish/save. */
export function startRecovery(store:Pick<RecoveryStore,'capture'>,snapshot:()=>PatternDocument|null,onError:(error:unknown)=>void){
  let busy=false,stopped=false;
  const tick=async()=>{if(busy||stopped)return;busy=true;try{const doc=snapshot();if(doc)await store.capture(doc);}catch(e){onError(e);}finally{busy=false;}};
  const timer=setInterval(()=>void tick(),60000);timer.unref();void tick();return ()=>{stopped=true;clearInterval(timer);};
}
