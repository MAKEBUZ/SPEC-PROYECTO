import { uuid } from '../../../contracts/src/validation.js';
export interface LocalOperation {
  operationId:string;accountId:string;requestHash:string;type:string;
  state:'pending'|'resolved'|'closed';pause:boolean;retryLevel:number;
  deadline:number|null;status:'checking'|'offline'|'no_permission'|'unavailable'|'ready';
  retryContinuity?:string;
  scopes:{kind:string;id:string}[];
  outcome?:'success'|'failure'|'no_change';confirmedAt?:string;receivedAt?:number;
  closedAt?:number;
}
export interface JournalStorage {
  read(key:string):Promise<string[]>;
  /** Compare-and-append. A stale writer must fail, never replace generations. */
  append(key:string,expected:readonly string[],encoded:string):Promise<void>;
  keys():Promise<string[]>;
  compact?(key:string):Promise<void>;
}
export async function retiredGeneration(key:string){const payload=JSON.stringify({version:1,key,sequence:1,previous:null,value:null});return JSON.stringify({payload,checksum:await journalHash(payload)});}
export const journalKey=(accountId:string,operationId:string)=>{uuid(accountId);uuid(operationId);return `${accountId}_${operationId}`;};
export async function journalHash(value:string){const bytes=new TextEncoder().encode(value),hash=await crypto.subtle.digest('SHA-256',bytes);return [...new Uint8Array(hash)].map(v=>v.toString(16).padStart(2,'0')).join('');}
interface Generation {version:1;key:string;sequence:number;previous:string|null;value:LocalOperation|null}
export function validateOperation(v:unknown):LocalOperation {
  if(!v||typeof v!=='object')throw new Error('JOURNAL_DAMAGED');const r=v as LocalOperation;
  uuid(r.accountId);uuid(r.operationId);
  if(!/^[a-f0-9]{64}$/.test(r.requestHash)||typeof r.type!=='string'||!r.type||!['pending','resolved','closed'].includes(r.state)||typeof r.pause!=='boolean'||!Number.isSafeInteger(r.retryLevel)||r.retryLevel<0||r.deadline!==null&&!Number.isFinite(r.deadline)||!['checking','offline','no_permission','unavailable','ready'].includes(r.status)||!Array.isArray(r.scopes))throw new Error('JOURNAL_DAMAGED');
  for(const s of r.scopes)if(!s||typeof s.kind!=='string'||!s.kind||typeof s.id!=='string'||!s.id)throw new Error('JOURNAL_DAMAGED');
  if(r.state==='resolved'&&(!['success','failure','no_change'].includes(r.outcome!)||!Number.isFinite(Date.parse(r.confirmedAt!))||!Number.isFinite(r.receivedAt)))throw new Error('JOURNAL_DAMAGED');
  if(r.state==='closed'&&!Number.isFinite(r.closedAt))throw new Error('JOURNAL_DAMAGED');
  if(r.state==='pending'&&(r.outcome!==undefined||r.confirmedAt!==undefined||r.receivedAt!==undefined||r.closedAt!==undefined))throw new Error('JOURNAL_DAMAGED');
  return structuredClone(r);
}
async function decode(key:string,records:readonly string[]){
  let previous:string|null=null,value:LocalOperation|null=null;
  for(const [i,encoded] of records.entries()){
    const envelope=JSON.parse(encoded) as {payload:string;checksum:string};
    if(typeof envelope.payload!=='string'||await journalHash(envelope.payload)!==envelope.checksum)throw new Error('JOURNAL_DAMAGED');
    const g=JSON.parse(envelope.payload) as Generation;
    if(g.version!==1||g.key!==key||g.sequence!==i+1||g.previous!==previous||i>0&&value===null)throw new Error('JOURNAL_DAMAGED');
    value=g.value===null?null:validateOperation(g.value);if(value&&journalKey(value.accountId,value.operationId)!==key)throw new Error('JOURNAL_DAMAGED');previous=envelope.checksum;
  }
  return {previous,value};
}
/** No corrupt generation can fall back to an older, apparently live operation. */
export class OperationJournal {
  private tail:Promise<unknown>=Promise.resolve();
  constructor(private readonly storage:JournalStorage){}
  async record(accountId:string,operationId:string){const key=journalKey(accountId,operationId),records=await this.storage.read(key);return {exists:records.length>0,value:(await decode(key,records)).value};}
  async accounts(){const ids=new Set<string>();for(const key of await this.storage.keys()){const id=key.slice(0,36);uuid(id);ids.add(id);}return [...ids];}
  private serial<T>(fn:()=>Promise<T>){const result=this.tail.catch(()=>undefined).then(fn);this.tail=result;return result;}
  private async write(key:string,records:string[],value:LocalOperation|null){
    const {previous}=await decode(key,records),g:Generation={version:1,key,sequence:records.length+1,previous,value},payload=JSON.stringify(g),encoded=JSON.stringify({payload,checksum:await journalHash(payload)});
    await this.storage.append(key,records,encoded);
    const actual=await this.storage.read(key);if(actual.length!==records.length+1||actual.at(-1)!==encoded)throw new Error('JOURNAL_SAVE_UNCONFIRMED');await decode(key,actual);
  }
  create(input:LocalOperation){const value=validateOperation(input);return this.serial(async()=>{if(value.state!=='pending')throw new Error('JOURNAL_TRANSITION_INVALID');const key=journalKey(value.accountId,value.operationId),records=await this.storage.read(key);if(records.length)throw new Error('OPERATION_ID_REUSED');await this.write(key,records,value);});}
  ensure(input:LocalOperation){const value=validateOperation(input);return this.serial(async()=>{if(value.state!=='pending')throw Error('JOURNAL_TRANSITION_INVALID');const key=journalKey(value.accountId,value.operationId),records=await this.storage.read(key);if(records.length){const old=(await decode(key,records)).value;if(old&&(old.type!==value.type||old.requestHash!==value.requestHash))throw Error('OPERATION_ID_REUSED');return old;}try{await this.write(key,records,value);return value;}catch(error){const after=await this.storage.read(key);if(after.length){const winner=(await decode(key,after)).value;if(!winner||winner.type===value.type&&winner.requestHash===value.requestHash)return winner;}throw error;}});}
  update(accountId:string,operationId:string,change:(current:LocalOperation)=>LocalOperation|null){return this.serial(async()=>{
    const key=journalKey(accountId,operationId),records=await this.storage.read(key),old=(await decode(key,records)).value;if(!old)throw new Error('OPERATION_UNAVAILABLE');
    const next=change(structuredClone(old));if(next){validateOperation(next);if(next.accountId!==old.accountId||next.operationId!==old.operationId||next.requestHash!==old.requestHash||next.type!==old.type||JSON.stringify(next.scopes)!==JSON.stringify(old.scopes)||old.state!=='pending'&&next.state==='pending'||old.state==='closed'&&(next.state!=='closed'||next.closedAt!==old.closedAt)||old.state==='resolved'&&next.state==='resolved'&&(next.outcome!==old.outcome||next.confirmedAt!==old.confirmedAt||next.receivedAt!==old.receivedAt))throw new Error('JOURNAL_TRANSITION_INVALID');}
    else if(old.state==='pending')throw new Error('PENDING_CANNOT_BE_REMOVED');
    await this.write(key,records,next);return next;
  });}
  async inspect(accountId:string|null,sessionValid:boolean){
    // No local identifiers, quantities or damage details before authentication.
    if(!accountId||!sessionValid)return {entries:[] as LocalOperation[],damaged:false};uuid(accountId);
    const entries:LocalOperation[]=[],keys=await this.storage.keys();let damaged=false;
    for(const key of keys.filter(k=>k.startsWith(`${accountId}_`))){try{const value=(await decode(key,await this.storage.read(key))).value;if(value&&value.state!=='closed')entries.push(value);}catch{damaged=true;}}
    return {entries,damaged};
  }
  compact(accountId:string,operationId:string){return this.serial(async()=>{
    const key=journalKey(accountId,operationId),records=await this.storage.read(key);
    if(!records.length||(await decode(key,records)).value!==null||!this.storage.compact)throw Error('JOURNAL_COMPACTION_FORBIDDEN');
    await this.storage.compact(key);const checked=await this.storage.read(key);
    if(!checked.length||(await decode(key,checked)).value!==null)throw Error('JOURNAL_COMPACTION_UNCONFIRMED');
  });}
  /** Maintenance-only: no UI projection or remote query. */
  async removedIds(accountId:string){
    uuid(accountId);const result:string[]=[];
    for(const key of (await this.storage.keys()).filter(k=>k.startsWith(`${accountId}_`))){const records=await this.storage.read(key);if(records.length&&(await decode(key,records)).value===null){const id=key.slice(37);uuid(id);result.push(id);}}
    return result;
  }
  retireClosed(accountId:string,operationId:string){return this.serial(async()=>{
    const key=journalKey(accountId,operationId),records=await this.storage.read(key),current=(await decode(key,records)).value;
    if(!current)return;if(current.state!=='closed')throw Error('JOURNAL_COMPACTION_FORBIDDEN');await this.write(key,records,null);
  });}
}
