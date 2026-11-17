import {randomUUID,createHash} from 'node:crypto';
import {DTO,type HttpDto} from '../../../../../packages/contracts/src/http-dto.js';
import {uuid} from '../../../../../packages/contracts/src/validation.js';
import {canonicalize} from '../../../../../packages/document/src/revision.js';
import {parseDocument} from '../../../../../packages/document/src/schema.js';
import {revisionId} from '../../../../../packages/document/src/revision.js';
import type {PublicationBundle} from './bundle.js';

export interface PublicationActor {accountId:string;sessionId:string}
export interface PublicationTarget {projectId:string;patternName?:string;binding?:PublicationBundle['document']['remoteBinding']}
export interface PublicationPorts {
 actor():Promise<PublicationActor>;
 /** Must inspect durable pending scopes and unfinished attempt/binding records,
  * and fail closed on damaged history. The host serializes by document/account. */
 blocked(accountId:string,documentId:string):Promise<boolean>;
 /** Persist the full correlation before sending. Failure prevents transport. */
 record(accountId:string,type:'beginPublication'|'commitPublication',body:Record<string,unknown>,context:{documentId:string;projectId:string;publicationId?:string}):Promise<void>;
 begin(body:HttpDto<'BeginPublication'>,actor:PublicationActor):Promise<unknown>;
 result(operationId:string,type:string,actor:PublicationActor):Promise<unknown>;
 resolve(accountId:string,result:HttpDto<'OperationView'>|HttpDto<'MutationResult'>,type:string):Promise<void>;
 upload(publicationId:string,fileId:string,bytes:Uint8Array,sha256:string,actor:PublicationActor):Promise<void>;
 commit(publicationId:string,body:HttpDto<'CommitPublication'>,actor:PublicationActor):Promise<unknown>;
 /** Persist binding separately, without replacing a newer active document. */
 bind(documentId:string,revisionId:string,binding:{accountId:string;patternId:string;lastPublishedVersion:string}):Promise<void>;
}
export type PublicationOutcome={state:'pending';operationId:string}|{state:'failed';operationId:string}|{state:'published';operationId:string;patternId:string;versionId:string};
const sha=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
/** One explicitly requested attempt. No automatic mutation retries, even when
 * transport rejects. Result queries and restart reconciliation belong to the
 * durable host; an unresolved begin/commit keeps its document scope blocked. */
export class ManualPublication {
 private busy=false;
 constructor(private readonly ports:PublicationPorts){}
 async publish(input:PublicationBundle,target:PublicationTarget):Promise<PublicationOutcome>{
  if(this.busy)throw Error('OPERATION_PENDING');this.busy=true;
  try{
   const bundle=structuredClone(input),manifest=DTO.Manifest.parse(bundle.manifest),actor=await this.ports.actor();uuid(actor.accountId);uuid(actor.sessionId);uuid(target.projectId);
   const content={documentId:manifest.documentId,localRevisionId:manifest.localRevisionId,files:manifest.files};
   if(sha(Buffer.from(canonicalize(content)))!==manifest.manifestHash||bundle.document.documentId!==manifest.documentId||bundle.document.revisionId!==manifest.localRevisionId)throw Error('ARTIFACT_MISMATCH');
   if(bundle.files.length!==manifest.files.length||new Set(bundle.files.map(f=>f.fileId)).size!==bundle.files.length)throw Error('ARTIFACT_MISMATCH');
   for(const file of manifest.files){const bytes=bundle.files.find(f=>f.fileId===file.fileId)?.bytes;if(!bytes||bytes.length!==file.bytes||sha(bytes)!==file.sha256)throw Error('ARTIFACT_MISMATCH');}
   const editable=manifest.files.find(f=>f.role==='editable')!;
   const saved=parseDocument(new TextDecoder('utf-8',{fatal:true}).decode(bundle.files.find(f=>f.fileId===editable.fileId)!.bytes));
   if(canonicalize(saved)!==canonicalize(bundle.document)||revisionId(saved)!==manifest.localRevisionId)throw Error('ARTIFACT_MISMATCH');
   const binding=target.binding??bundle.document.remoteBinding;
   if(binding&&binding.accountId!==actor.accountId)throw Error('ACCOUNT_MISMATCH');
   if(await this.ports.blocked(actor.accountId,manifest.documentId))throw Error('OPERATION_PENDING');
   const same=async()=>{const current=await this.ports.actor();if(current.accountId!==actor.accountId||current.sessionId!==actor.sessionId)throw Error('SESSION_CHANGED');};
   const context={documentId:manifest.documentId,projectId:target.projectId};
   const body=DTO.BeginPublication.parse({operationId:randomUUID(),projectId:target.projectId,manifest,...binding?{patternId:binding.patternId,expectedVersionId:binding.lastPublishedVersion}:{patternName:target.patternName?.trim()??''}});
   await same();await this.ports.record(actor.accountId,'beginPublication',body,context);
   // A failure after record is deliberately uncertain, never a permission to repeat.
   await same();const response=await this.ports.begin(body,actor);
   const result=DTO.OperationView.parse(await this.ports.result(body.operationId,'beginPublication',actor));
   if(result.operationId!==body.operationId||result.operationType!=='beginPublication')throw Error('RESULT_MISMATCH');
   await this.ports.resolve(actor.accountId,result,'beginPublication');
   if(result.state==='pending')return {state:'pending',operationId:body.operationId};
   if(result.outcome!=='success')return {state:'failed',operationId:body.operationId};
   const started=response as {publicationId?:unknown;manifestHash?:unknown};uuid(started?.publicationId);
   if(started.manifestHash!==manifest.manifestHash)throw Error('ARTIFACT_MISMATCH');
   const publicationId=started.publicationId as string;
   for(const file of manifest.files){await same();await this.ports.upload(publicationId,file.fileId,bundle.files.find(f=>f.fileId===file.fileId)!.bytes,file.sha256,actor);}
   await same();const commit=DTO.CommitPublication.parse({operationId:randomUUID(),manifestHash:manifest.manifestHash});
   await this.ports.record(actor.accountId,'commitPublication',commit,{...context,publicationId});
   await same();const confirmed=DTO.MutationResult.parse(await this.ports.commit(publicationId,commit,actor));
   if(confirmed.operationId!==commit.operationId)throw Error('RESULT_MISMATCH');
   // Preserve the server outcome even when the user logged out during the request.
   // The host must hide it according to the original account's lifecycle.
   await this.ports.resolve(actor.accountId,confirmed,'commitPublication');
   if(confirmed.state==='pending')return {state:'pending',operationId:commit.operationId};
   if(confirmed.outcome!=='success')return {state:'failed',operationId:commit.operationId};
   const data=confirmed.data as {patternId?:unknown;versionId?:unknown;localRevisionId?:unknown};uuid(data?.patternId);uuid(data?.versionId);
   if(data.localRevisionId!==manifest.localRevisionId||binding&&data.patternId!==binding.patternId)throw Error('RESULT_MISMATCH');
   await this.ports.bind(manifest.documentId,manifest.localRevisionId,{accountId:actor.accountId,patternId:data.patternId as string,lastPublishedVersion:data.versionId as string});
   return {state:'published',operationId:commit.operationId,patternId:data.patternId as string,versionId:data.versionId as string};
  }finally{this.busy=false;}
 }
}
