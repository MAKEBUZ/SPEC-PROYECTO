import {mkdir,readdir,readFile,open,rename,unlink} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {canonicalize} from '../../../../packages/document/src/revision.js';
import {keys,object,uuid,text} from '../../../../packages/contracts/src/validation.js';
import {suppressionStillNeeded,validateCopyInventory,type RecoverableCopy} from './backup-policy.js';
export interface SuppressionScope {kind:'project'|'pattern'|'account';resourceIds:string[];objectKeys:string[]}
export type SuppressionEvent={id:string;kind:'intent';scope:SuppressionScope}|{id:string;kind:'confirmed'|'cancelled';intentId:string};
type RetiredEvent={id:'00000000-0000-4000-8000-000000000000';kind:'retired';through:number};
export interface SuppressionRecord {sequence:number;event:SuppressionEvent|RetiredEvent;previous:string|null;hash:string;retirementHash?:string}
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
const hex=(s:unknown)=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s);
function event(input:unknown):SuppressionEvent{
 const v=object(input);uuid(v.id);
 if(v.kind==='intent'){
  keys(v,['id','kind','scope']);const s=object(v.scope);keys(s,['kind','resourceIds','objectKeys']);
  if(!['project','pattern','account'].includes(s.kind as string)||!Array.isArray(s.resourceIds)||!s.resourceIds.length||!Array.isArray(s.objectKeys))throw Error('SUPPRESSION_INVALID');
  s.resourceIds.forEach(uuid);s.objectKeys.forEach(k=>{if(!hex(k))throw Error('SUPPRESSION_INVALID');});
  if(new Set(s.resourceIds).size!==s.resourceIds.length||new Set(s.objectKeys).size!==s.objectKeys.length)throw Error('SUPPRESSION_INVALID');
 }else if((v.kind==='confirmed'||v.kind==='cancelled')){keys(v,['id','kind','intentId']);uuid(v.intentId);}else throw Error('SUPPRESSION_INVALID');
 return structuredClone(v) as unknown as SuppressionEvent;
}
function validate(records:readonly SuppressionRecord[]){
 const ids=new Set<string>(),intents=new Set<string>(),confirmed=new Set<string>();
 for(const [i,r] of records.entries()){
  if(r.sequence!==i+1||r.previous!==(records[i-1]?.hash??null)||!hex(r.hash))throw Error('SUPPRESSION_LOG_DAMAGED');
  if(r.event.kind==='retired'){
   keys(object(r),['sequence','event','previous','hash','retirementHash']);keys(object(r.event),['id','kind','through']);
   const {retirementHash,...anchor}=r;
   if(r.event.id!=='00000000-0000-4000-8000-000000000000'||!Number.isSafeInteger(r.event.through)||r.event.through<r.sequence||r.event.through>records.length||retirementHash!==hash(canonicalize(anchor)))throw Error('SUPPRESSION_LOG_DAMAGED');
   continue;
  }
  keys(object(r),['sequence','event','previous','hash']);const e=event(r.event);
  if(r.hash!==hash(canonicalize({sequence:r.sequence,previous:r.previous,event:e}))||ids.has(e.id))throw Error('SUPPRESSION_LOG_DAMAGED');
  if(e.kind==='intent')intents.add(e.id);
  else {if(!intents.has(e.intentId)||confirmed.has(e.intentId))throw Error('SUPPRESSION_LOG_DAMAGED');confirmed.add(e.intentId);}
  ids.add(e.id);
 }
}
function envelope(value:unknown){const payload=canonicalize(value);return JSON.stringify({payload,hash:hash(payload)});}
function unpack(value:string):unknown {const e=object(JSON.parse(value));keys(e,['payload','hash']);text(e.payload);if(hash(e.payload)!==e.hash)throw Error('SUPPRESSION_LOG_DAMAGED');return JSON.parse(e.payload);}
/** Local external-journal transport. Exclusive operational owner; stale locks
 * fail closed. Compaction removes scopes, retaining only anonymous chain anchors
 * needed to authenticate existing manifest watermarks, never account identities. */
export class LocalSuppressionLog {
 private tail:Promise<unknown>=Promise.resolve();
 constructor(private readonly directory:string){}
 private serial<T>(fn:()=>Promise<T>){const next=this.tail.catch(()=>undefined).then(async()=>{
  await mkdir(this.directory,{recursive:true,mode:0o700});const path=join(this.directory,'journal.lock'),lock=await open(path,'wx',0o600);
  try{return await fn();}finally{await lock.close();await unlink(path);}
 });this.tail=next;return next;}
 private async readAll():Promise<SuppressionRecord[]>{
  try{
   const files=(await readdir(this.directory)).filter(f=>f!=='journal.lock').sort();let records:SuppressionRecord[]=[];
   if(files.includes('compaction.pending'))throw Error('SUPPRESSION_COMPACTION_INTERRUPTED');
   if(files.includes('compaction.json')){const state=object(unpack(await readFile(join(this.directory,'compaction.json'),'utf8')));keys(state,['records']);if(!Array.isArray(state.records))throw Error();records=state.records as SuppressionRecord[];validate(records);}
   const compacted=records.length;
   for(const file of files){
    if(file==='compaction.json')continue;
    if(!/^\d{12}\.json$/.test(file))throw Error();const seq=Number(file.slice(0,12));
    if(seq<=compacted)continue; // committed snapshot supersedes old files even after interrupted cleanup
    if(seq!==records.length+1)throw Error();
    const stored=object(unpack(await readFile(join(this.directory,file),'utf8')));keys(stored,['sequence','previous','event']);
    const e=event(stored.event),payload=canonicalize(stored);
    records.push({sequence:stored.sequence as number,previous:stored.previous as string|null,event:e,hash:hash(payload)});
   }
   validate(records);return records;
  }catch{throw Error('SUPPRESSION_LOG_DAMAGED');}
 }
 read(){return this.serial(()=>this.readAll());}
 append(input:SuppressionEvent){const captured=event(input);return this.serial(async()=>{
  const records=await this.readAll(),existing=records.find(r=>r.event.kind!=='retired'&&r.event.id===captured.id);
  if(existing){if(canonicalize(existing.event)!==canonicalize(captured))throw Error('SUPPRESSION_ID_REUSED');return existing;}
  if((captured.kind==='confirmed'||captured.kind==='cancelled')){
   if(!records.some(r=>r.event.kind==='intent'&&r.event.id===captured.intentId))throw Error('SUPPRESSION_INTENT_MISSING');
   if(records.some(r=>(r.event.kind==='confirmed'||r.event.kind==='cancelled')&&r.event.intentId===captured.intentId))throw Error('SUPPRESSION_ALREADY_CONFIRMED');
  }
  const sequence=records.length+1,previous=records.at(-1)?.hash??null,value={sequence,previous,event:captured},checksum=hash(canonicalize(value));
  const handle=await open(join(this.directory,`${String(sequence).padStart(12,'0')}.json`),'wx',0o600);
  try{await handle.writeFile(envelope(value));await handle.sync();}finally{await handle.close();}
  const verified=(await this.readAll()).at(-1);if(!verified||verified.hash!==checksum)throw Error('SUPPRESSION_WRITE_UNCONFIRMED');return verified;
 });}
 /** Caller holds the global writer barrier and inventory lock. settled contains
  * only jobs whose final database result is durably complete, never missing jobs. */
 compact(copies:readonly RecoverableCopy[],settled:ReadonlySet<string>){return this.serial(async()=>{
  validateCopyInventory(copies);const records=await this.readAll();
  for(const c of copies.filter(c=>c.state!=='deleted')){
   const w=c.watermark;if(w.sequence>records.length||(w.sequence===0?w.hash!==null:records[w.sequence-1]?.hash!==w.hash))throw Error('SUPPRESSION_WATERMARK_INVALID');
   if(records.some(r=>r.event.kind==='retired'&&r.event.through>w.sequence))throw Error('SUPPRESSION_WATERMARK_RETIRED');
  }
  let count=0;
  for(const terminal of records.filter(r=>r.event.kind==='confirmed'||r.event.kind==='cancelled')){
   if((terminal.event.kind!=='confirmed'&&terminal.event.kind!=='cancelled')||(terminal.event.kind==='confirmed'&&!settled.has(terminal.event.intentId))||suppressionStillNeeded(copies,terminal.sequence))continue;
   const intentId=terminal.event.intentId;
   const intent=records.find(r=>r.event.kind==='intent'&&r.event.id===intentId);if(!intent)throw Error('SUPPRESSION_LOG_DAMAGED');
   for(const r of [intent,terminal]){r.event={id:'00000000-0000-4000-8000-000000000000',kind:'retired',through:terminal.sequence};const {retirementHash,...anchor}=r;r.retirementHash=hash(canonicalize(anchor));count++;}
  }
  if(count){
   validate(records);const pending=join(this.directory,'compaction.pending'),handle=await open(pending,'wx',0o600);
   try{await handle.writeFile(envelope({records}));await handle.sync();}finally{await handle.close();}
   const readback=unpack(await readFile(pending,'utf8'));if(canonicalize(readback)!==canonicalize({records}))throw Error('SUPPRESSION_WRITE_UNCONFIRMED');
   await rename(pending,join(this.directory,'compaction.json')); // sole commit boundary; failure keeps evidence and blocks
   await this.readAll();
  }
  // Retry physical removal after an interrupted cleanup, including a no-op pass.
  let covered=0;try{const snapshot=object(unpack(await readFile(join(this.directory,'compaction.json'),'utf8')));covered=(snapshot.records as unknown[]).length;}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
  for(const file of await readdir(this.directory))if(/^\d{12}\.json$/.test(file)&&Number(file.slice(0,12))<=covered)await unlink(join(this.directory,file));
  return count;
 });}
}
export function suppressionPlan(records:readonly SuppressionRecord[],watermark:{sequence:number;hash:string|null}){
 validate(records);
 if(!Number.isSafeInteger(watermark.sequence)||watermark.sequence<0||watermark.sequence>records.length||(watermark.sequence===0?watermark.hash!==null:records[watermark.sequence-1]?.hash!==watermark.hash))throw Error('SUPPRESSION_WATERMARK_INVALID');
 if(records.some(r=>r.event.kind==='retired'&&r.event.through>watermark.sequence))throw Error('SUPPRESSION_WATERMARK_RETIRED');
 const intents=records.filter((r):r is SuppressionRecord&{event:Extract<SuppressionEvent,{kind:'intent'}>}=>r.event.kind==='intent');
 if(intents.some(r=>!records.some(c=>(c.event.kind==='confirmed'||c.event.kind==='cancelled')&&c.event.intentId===r.event.id)))throw Error('RESTORE_REQUIRES_RECONCILIATION');
 return intents.filter(r=>records.some(c=>c.sequence>watermark.sequence&&c.event.kind==='confirmed'&&c.event.intentId===r.event.id)).map(r=>structuredClone(r.event.scope));
}
