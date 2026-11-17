import {DTO,type HttpDto} from '../../../../../packages/contracts/src/http-dto.js';
import {uuid,object,keys,text} from '../../../../../packages/contracts/src/validation.js';
import {journalHash,journalKey,type JournalStorage} from '../../../../../packages/document/src/operations/journal.js';
export interface PublishedBinding {accountId:string;patternId:string;lastPublishedVersion:string;projectId:string;revisionId:string}
export interface PublicationState {
 accountId:string;documentId:string;
 binding?:PublishedBinding;
 project?:HttpDto<'CreateProject'>;
 selectedProjectId?:string;
 attempt?:{begin:HttpDto<'BeginPublication'>;publicationId?:string;commit?:HttpDto<'CommitPublication'>;abandon?:HttpDto<'Operation'>};
 outcome?:'published'|'failed';
}
function valid(input:unknown):PublicationState{
 const s=object(input);keys(s,['accountId','documentId'],['binding','project','selectedProjectId','attempt','outcome']);uuid(s.accountId);uuid(s.documentId);
 if(s.selectedProjectId!==undefined)uuid(s.selectedProjectId);
 if(s.project!==undefined)DTO.CreateProject.parse(s.project);
 if(s.binding!==undefined){const b=object(s.binding);keys(b,['accountId','patternId','lastPublishedVersion','projectId','revisionId']);for(const k of ['accountId','patternId','lastPublishedVersion','projectId'])uuid(b[k]);text(b.revisionId);if(!/^[a-f0-9]{64}$/.test(b.revisionId)||b.accountId!==s.accountId)throw Error('PUBLICATION_STATE_DAMAGED');}
 if(s.attempt!==undefined){const a=object(s.attempt);keys(a,['begin'],['publicationId','commit','abandon']);const b=DTO.BeginPublication.parse(a.begin);if(b.manifest.documentId!==s.documentId)throw Error('PUBLICATION_STATE_DAMAGED');if(a.publicationId!==undefined)uuid(a.publicationId);if(a.commit!==undefined){const c=DTO.CommitPublication.parse(a.commit);if(!a.publicationId||c.manifestHash!==b.manifest.manifestHash)throw Error('PUBLICATION_STATE_DAMAGED');}if(a.abandon!==undefined){DTO.Operation.parse(a.abandon);if(!a.publicationId||a.commit)throw Error('PUBLICATION_STATE_DAMAGED');}}
 if(s.outcome!==undefined&&!['published','failed'].includes(String(s.outcome)))throw Error('PUBLICATION_STATE_DAMAGED');
 return structuredClone(s) as unknown as PublicationState;
}
/** Append-only, checksum-linked metadata. The storage keeps exact-generation
 * recovery copies. No credentials or editable/preview bytes are persisted here. */
export class PublicationStateStore {
 private tail:Promise<unknown>=Promise.resolve();
 constructor(private readonly storage:JournalStorage){}
 private async decode(key:string){let previous:string|null=null,state:PublicationState|undefined,retired=false;const records=await this.storage.read(key);
  for(const [i,encoded] of records.entries()){const e=JSON.parse(encoded);if(typeof e.payload!=='string'||await journalHash(e.payload)!==e.checksum)throw Error('PUBLICATION_STATE_DAMAGED');const g=JSON.parse(e.payload);if(g.key!==key||g.sequence!==i+1||g.previous!==previous||retired)throw Error('PUBLICATION_STATE_DAMAGED');if(g.value===null){retired=true;state=undefined;}else{state=valid(g.value);if(journalKey(state.accountId,state.documentId)!==key)throw Error('PUBLICATION_STATE_DAMAGED');}previous=e.checksum;}
  return {state,records,previous,retired};
 }
 async load(accountId:string,documentId:string){const value=await this.decode(journalKey(accountId,documentId));if(value.retired)throw Error('PUBLICATION_ACCOUNT_CLOSED');return value.state??{accountId,documentId};}
 /** Only after durable account-deletion retention expiry; never touches editable documents. */
 retireAccount(accountId:string){const run=this.tail.catch(()=>{}).then(async()=>{for(const documentId of await this.documents(accountId)){const key=journalKey(accountId,documentId),old=await this.decode(key);if(!old.retired){const payload=JSON.stringify({key,sequence:old.records.length+1,previous:old.previous,value:null});await this.storage.append(key,old.records,JSON.stringify({payload,checksum:await journalHash(payload)}));if(!(await this.decode(key)).retired)throw Error('PUBLICATION_SAVE_UNCONFIRMED');}if(!this.storage.compact)throw Error('PUBLICATION_CLEANUP_UNAVAILABLE');await this.storage.compact(key);}});this.tail=run;return run;}
 async documents(accountId:string){uuid(accountId);return (await this.storage.keys()).filter(k=>k.startsWith(accountId+'_')).map(k=>{const id=k.slice(37);uuid(id);return id;});}
 save(input:PublicationState){const state=valid(input);const run=this.tail.catch(()=>{}).then(async()=>{const key=journalKey(state.accountId,state.documentId),old=await this.decode(key);if(old.retired)throw Error('PUBLICATION_ACCOUNT_CLOSED');const payload=JSON.stringify({key,sequence:old.records.length+1,previous:old.previous,value:state}),encoded=JSON.stringify({payload,checksum:await journalHash(payload)});await this.storage.append(key,old.records,encoded);if(JSON.stringify((await this.decode(key)).state)!==JSON.stringify(state))throw Error('PUBLICATION_SAVE_UNCONFIRMED');});this.tail=run;return run;}
}
