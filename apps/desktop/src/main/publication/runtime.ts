import {randomUUID} from 'node:crypto';
import {DTO,type HttpDto} from '../../../../../packages/contracts/src/http-dto.js';
import {uuid} from '../../../../../packages/contracts/src/validation.js';
import type {PublicationBundle} from './bundle.js';
import {ManualPublication,type PublicationActor} from './manual-publication.js';
import {PublicationStateStore,type PublicationState,type PublishedBinding} from './state-store.js';
import type {PatternDocument} from '../../../../../packages/document/src/schema.js';
import type {RemoteConflict,RemoteVersion} from './conflicts.js';
export interface PublicationConflictInfo {kind:RemoteConflict['kind']|'current';source:NonNullable<PatternDocument['remoteBinding']>;documentId:string;actor:PublicationActor;currentVersionId?:string;projectId?:string}
export interface PublicationTransport {
 publicationActor():PublicationActor;
 publicationRequest(actor:PublicationActor,method:'GET'|'POST'|'PUT',path:string,body?:unknown):Promise<unknown>;
}
export interface PublicationTracking {
 beginMutation(accountId:string,type:string,body:Record<string,unknown>,scopes?:{kind:string;id:string}[]):Promise<void>;
 acceptOperation(accountId:string,type:string,value:unknown):Promise<void>;
 publicationBlocked(accountId:string,scopes:{kind:string;id:string}[]):Promise<boolean>;
 publicationMayQuery(accountId:string,id:string):Promise<boolean>;
 publicationDeferred?(accountId:string,id:string,code?:string):Promise<void>;
 accountDeletionConfirmed?(accountId:string):Promise<boolean>;
}
export class PublicationRuntime {
 private busy=false;
 constructor(private readonly store:PublicationStateStore,private readonly remote:PublicationTransport,private readonly tracking:PublicationTracking){}
 async pendingPdfs(documentId:string){const actor=this.remote.publicationActor(),state=await this.store.load(actor.accountId,documentId);this.same(actor);return state.attempt?.begin.manifest.files.filter(f=>f.role==='pdf')??[];}
 private same(actor:PublicationActor){const a=this.remote.publicationActor();if(a.accountId!==actor.accountId||a.sessionId!==actor.sessionId)throw Error('SESSION_CHANGED');}
 assertConflictActor(info:PublicationConflictInfo){this.same(info.actor);}
 async canResolveConflict(info:PublicationConflictInfo){
  if(info.kind==='account-deleted-confirmed'){if(!await this.tracking.accountDeletionConfirmed?.(info.source.accountId))throw Error('DELETION_UNCONFIRMED');return;}
  const s=await this.store.load(info.source.accountId,info.documentId);if(s.attempt||s.project||await this.tracking.publicationBlocked(s.accountId,this.scope(s)))throw Error('OPERATION_PENDING');
 }
 async inspectConflict(snapshot:PatternDocument):Promise<PublicationConflictInfo>{return this.exclusive(async()=>{
  const actor=this.remote.publicationActor(),s=await this.store.load(actor.accountId,snapshot.documentId);
  if(s.attempt||s.project){await this.reconcileState(s,actor,true);if(s.attempt||s.project)throw Error('OPERATION_PENDING');}
  const source=s.binding??snapshot.remoteBinding;if(!source)throw Error('REMOTE_BINDING_REQUIRED');
  if(source.accountId!==actor.accountId){if(await this.tracking.accountDeletionConfirmed?.(source.accountId))return {kind:'account-deleted-confirmed',source,documentId:snapshot.documentId,actor};throw Error('ACCOUNT_MISMATCH');}
  if(await this.tracking.publicationBlocked(actor.accountId,this.scope(s)))throw Error('OPERATION_PENDING');
  const status=DTO.PublicationStatus.parse(await this.remote.publicationRequest(actor,'GET',`/patterns/${source.patternId}/publication-status`));if(status.patternId!==source.patternId)throw Error('RESULT_MISMATCH');this.same(actor);
  return {kind:status.kind==='active'?(status.versionId===source.lastPublishedVersion?'current':'version-conflict'):status.kind,source,documentId:snapshot.documentId,actor,...status.kind==='active'?{currentVersionId:status.versionId,projectId:status.projectId}:{}};
 });}
 async downloadConflict(info:PublicationConflictInfo):Promise<{metadata:RemoteVersion;bytes:Uint8Array}>{
  if(info.kind!=='version-conflict'||!info.currentVersionId)throw Error('CONFLICT_NOT_AVAILABLE');this.same(info.actor);await this.canResolveConflict(info);
  const current=DTO.PublicationStatus.parse(await this.remote.publicationRequest(info.actor,'GET',`/patterns/${info.source.patternId}/publication-status`));
  if(current.kind!=='active'||current.versionId!==info.currentVersionId||current.patternId!==info.source.patternId)throw Error('CONFLICT_CHANGED');
  const files=DTO.FilePage.parse(await this.remote.publicationRequest(info.actor,'GET',`/versions/${current.versionId}/files`));const editables=files.items.filter(f=>f.role==='editable');if(editables.length!==1||files.nextCursor!==null)throw Error('ARTIFACT_MISMATCH');const file=editables[0]!;
  const bytes=await this.remote.publicationRequest(info.actor,'GET',`/files/${file.id}/content`);if(!(bytes instanceof Uint8Array))throw Error('ARTIFACT_MISMATCH');this.same(info.actor);
  return {metadata:{accountId:info.source.accountId,patternId:info.source.patternId,versionId:current.versionId,documentId:file.documentId,revisionId:file.localRevisionId,sha256:file.sha256,bytes:file.bytes},bytes};
 }
 private async exclusive<T>(run:()=>Promise<T>){if(this.busy)throw Error('OPERATION_PENDING');this.busy=true;try{return await run();}finally{this.busy=false;}}
 private scope(s:PublicationState,projectId?:string,patternId?:string){const begin=s.attempt?.begin,project=projectId??begin?.projectId??s.binding?.projectId,pattern=patternId??(begin&&'patternId'in begin?begin.patternId:undefined)??s.binding?.patternId;return [{kind:'document',id:s.documentId},...(pattern?[{kind:'pattern',id:pattern}]:[]),...(project?[{kind:'project-member',id:project}]:[])];}
 private async record(s:PublicationState,type:string,body:Record<string,unknown>){await this.tracking.beginMutation(s.accountId,type,body,this.scope(s));await this.store.save(s);}
 private async resolved(s:PublicationState,type:string,result:HttpDto<'OperationView'>|HttpDto<'MutationResult'>){
  if(result.state!=='resolved')return;
  await this.tracking.acceptOperation(s.accountId,type,{operationId:result.operationId,state:result.state,outcome:result.outcome,confirmedAt:result.confirmedAt,data:'data'in result?result.data:{}});
 }
 private async query(s:PublicationState,actor:PublicationActor,type:string,operationId:string){
  try{const result=DTO.OperationView.parse(await this.remote.publicationRequest(actor,'GET',`/operations/${operationId}?operationType=${type}`));
   if(result.operationId!==operationId||result.operationType!==type)throw Error('RESULT_MISMATCH');
   if(result.state==='pending')await this.tracking.publicationDeferred?.(s.accountId,operationId);else await this.resolved(s,type,result);return result;
  }catch(e){await this.tracking.publicationDeferred?.(s.accountId,operationId,e instanceof Error?e.message:undefined);throw e;}
 }
 private async ensure(s:PublicationState,type:string,body:Record<string,unknown>){try{await this.tracking.beginMutation(s.accountId,type,body,this.scope(s));}catch(e){if(!(e instanceof Error)||e.message!=='OPERATION_ID_REUSED')throw e;/* A cleared result must not be reconstructed; its durable attempt still reconciles. */}}
 private async bind(s:PublicationState,patternId:string,versionId:string){
  uuid(patternId);uuid(versionId);const a=s.attempt;if(!a?.commit)throw Error('RESULT_MISMATCH');
  if('patternId'in a.begin&&patternId!==a.begin.patternId)throw Error('RESULT_MISMATCH');
  s.binding={accountId:s.accountId,patternId,lastPublishedVersion:versionId,projectId:a.begin.projectId,revisionId:a.begin.manifest.localRevisionId};
  delete s.attempt;s.outcome='published';await this.store.save(s);
 }
 private async reconcileState(s:PublicationState,actor:PublicationActor,manual:boolean){
  if(s.project){const op=s.project;if(manual||await this.tracking.publicationMayQuery(s.accountId,op.operationId)){
   await this.ensure(s,'createProject',op);const r=await this.query(s,actor,'createProject',op.operationId);
   if(r.state==='resolved'){if(r.outcome==='success'){const id=r.authorizedResourceRefs.find(v=>v.kind==='project')?.id;if(!id)throw Error('RESULT_MISMATCH');s.selectedProjectId=id;}else s.outcome='failed';delete s.project;await this.store.save(s);}
  }}
  const a=s.attempt;if(!a)return;
  if(!manual&&a.publicationId&&!a.commit&&!a.abandon)return;
  const body=a.abandon??a.commit??a.begin,type=a.abandon?'abandonPublication':a.commit?'commitPublication':'beginPublication';
  if(!manual&&!await this.tracking.publicationMayQuery(s.accountId,body.operationId))return;
  await this.ensure(s,type,body);
  const r=await this.query(s,actor,type,body.operationId);if(r.state!=='resolved')return;
  if(a.abandon){if(r.outcome==='success'){delete s.attempt;delete s.outcome;}else{delete a.abandon;s.outcome='failed';}await this.store.save(s);return;}
  if(r.outcome!=='success'){delete s.attempt;s.outcome='failed';await this.store.save(s);return;}
  if(a.commit){const pattern=r.authorizedResourceRefs.find(v=>v.kind==='pattern')?.id,version=r.authorizedResourceRefs.find(v=>v.kind==='version')?.id;if(!pattern||!version)throw Error('RESULT_MISMATCH');await this.bind(s,pattern,version);}
  else {const id=r.authorizedResourceRefs.find(v=>v.kind==='publication')?.id;if(!id||a.publicationId&&a.publicationId!==id)throw Error('RESULT_MISMATCH');if(!a.publicationId){a.publicationId=id;await this.store.save(s);}}
 }
 async reconcile(documentId:string,manual=true){return this.exclusive(async()=>{const actor=this.remote.publicationActor(),s=await this.store.load(actor.accountId,documentId);await this.reconcileState(s,actor,manual);this.same(actor);return this.view(s);});}
 async tick(){if(this.busy)return;await this.exclusive(async()=>{const actor=this.remote.publicationActor();for(const documentId of await this.store.documents(actor.accountId)){const s=await this.store.load(actor.accountId,documentId);try{await this.reconcileState(s,actor,false);}catch{/* Preserve the durable pending state. No mutation is retried here. */}this.same(actor);}});}
 private view(s:PublicationState){return {accountId:s.accountId,binding:s.binding??null,target:s.binding?{patternId:s.binding.patternId,projectId:s.binding.projectId}:null,selectedProjectId:s.selectedProjectId??null,state:s.project?'project_pending':s.attempt?.abandon?'abandon_pending':s.attempt?.commit?'commit_pending':s.attempt?.publicationId?'upload_ready':s.attempt?'begin_pending':s.outcome??'local'};}
 async status(documentId:string,localBinding?:PublicationBundle['document']['remoteBinding']){const actor=this.remote.publicationActor(),s=await this.store.load(actor.accountId,documentId);let target=this.view(s).target;if(!target&&localBinding){if(localBinding.accountId!==actor.accountId)throw Error('ACCOUNT_MISMATCH');uuid(localBinding.patternId);const p=DTO.PatternView.parse(await this.remote.publicationRequest(actor,'GET',`/patterns/${localBinding.patternId}`));if(p.ownerId!==actor.accountId)throw Error('ACCESS_DENIED');target={patternId:p.id,projectId:p.projectId};}this.same(actor);return {...this.view(s),target};}
 async projects(cursor?:string){const actor=this.remote.publicationActor(),page=DTO.ProjectPage.parse(await this.remote.publicationRequest(actor,'GET','/projects?limit=100'+(cursor?'&cursor='+encodeURIComponent(cursor):'')));this.same(actor);return {...page,accountId:actor.accountId,items:page.items.filter(p=>p.state==='active'&&p.ownerId===actor.accountId)};}
 async createProject(documentId:string,name:string){return this.exclusive(async()=>{
  const actor=this.remote.publicationActor(),s=await this.store.load(actor.accountId,documentId);if(s.project||s.attempt||await this.tracking.publicationBlocked(s.accountId,this.scope(s)))throw Error('OPERATION_PENDING');
  s.project=DTO.CreateProject.parse({operationId:randomUUID(),name:name.trim()});delete s.outcome;await this.record(s,'createProject',s.project);
  await this.remote.publicationRequest(actor,'POST','/projects',s.project);await this.reconcileState(s,actor,true);this.same(actor);return this.view(s);
 });}
 async publish(bundle:PublicationBundle,projectId:string,patternName:string){return this.exclusive(async()=>{
  const actor=this.remote.publicationActor(),s=await this.store.load(actor.accountId,bundle.document.documentId);if(s.project||s.attempt)throw Error('OPERATION_PENDING');
  let binding=s.binding??bundle.document.remoteBinding;
  if(binding){if(binding.accountId!==actor.accountId)throw Error('ACCOUNT_MISMATCH');const pattern=DTO.PatternView.parse(await this.remote.publicationRequest(actor,'GET',`/patterns/${binding.patternId}`));if(pattern.ownerId!==actor.accountId||pattern.state!=='active')throw Error('RESOURCE_TRASHED');projectId=pattern.projectId;}
  const project=DTO.ProjectView.parse(await this.remote.publicationRequest(actor,'GET',`/projects/${projectId}`));if(project.ownerId!==actor.accountId||project.state!=='active')throw Error('RESOURCE_TRASHED');
  const engine=new ManualPublication({actor:async()=>this.remote.publicationActor(),blocked:()=>this.tracking.publicationBlocked(actor.accountId,this.scope(s,projectId,binding?.patternId)),
   record:async(_id,type,body)=>{if(type==='beginPublication'){s.attempt={begin:DTO.BeginPublication.parse(body)};delete s.outcome;}else{if(!s.attempt?.publicationId)throw Error('PUBLICATION_STATE_DAMAGED');s.attempt.commit=DTO.CommitPublication.parse(body);}await this.record(s,type,body);},
   begin:async(body,a)=>{const r=await this.remote.publicationRequest(a,'POST','/publications',body) as {publicationId:unknown;manifestHash:unknown};uuid(r.publicationId);if(r.manifestHash!==body.manifest.manifestHash)throw Error('ARTIFACT_MISMATCH');s.attempt!.publicationId=r.publicationId as string;await this.store.save(s);return r;},
   result:(id,type,a)=>this.remote.publicationRequest(a,'GET',`/operations/${id}?operationType=${type}`),
   resolve:async(_id,r,type)=>{await this.resolved(s,type,r);if(r.state==='resolved'&&r.outcome!=='success'){delete s.attempt;s.outcome='failed';await this.store.save(s);}},
   upload:(id,file,bytes,_hash,a)=>this.remote.publicationRequest(a,'PUT',`/publications/${id}/files/${file}`,bytes).then(()=>{}),
   commit:(id,body,a)=>this.remote.publicationRequest(a,'POST',`/publications/${id}/commit`,body),
   bind:(_doc,_revision,b)=>this.bind(s,b.patternId,b.lastPublishedVersion),
  });
  await engine.publish(bundle,{projectId,patternName,...binding?{binding}:{}});this.same(actor);return this.view(s);
 });}
 async continueUpload(bundle:PublicationBundle){return this.exclusive(async()=>{
  const actor=this.remote.publicationActor(),s=await this.store.load(actor.accountId,bundle.document.documentId);await this.reconcileState(s,actor,true);const a=s.attempt;
  if(!a?.publicationId||a.commit||a.abandon)throw Error('OPERATION_PENDING');
  if(a.begin.manifest.localRevisionId!==bundle.manifest.localRevisionId)throw Error('SAVED_REVISION_MISMATCH');
  const remote=DTO.PublicationView.parse(await this.remote.publicationRequest(actor,'GET',`/publications/${a.publicationId}`));
  if(remote.publicationId!==a.publicationId||remote.manifestHash!==a.begin.manifest.manifestHash||remote.state!=='staging'||remote.commitOperationId)throw Error('RESULT_MISMATCH');
  for(const f of a.begin.manifest.files){const match=bundle.manifest.files.find(v=>v.role===f.role&&v.sha256===f.sha256&&v.bytes===f.bytes);if(!match)throw Error('ARTIFACT_MISMATCH');const bytes=bundle.files.find(v=>v.fileId===match.fileId)?.bytes;if(!bytes)throw Error('ARTIFACT_MISMATCH');if(remote.files.find(v=>v.fileId===f.fileId)?.uploadState!=='received')await this.remote.publicationRequest(actor,'PUT',`/publications/${a.publicationId}/files/${f.fileId}`,bytes);}
  a.commit={operationId:randomUUID(),manifestHash:a.begin.manifest.manifestHash};await this.record(s,'commitPublication',a.commit);
  const result=DTO.MutationResult.parse(await this.remote.publicationRequest(actor,'POST',`/publications/${a.publicationId}/commit`,a.commit));if(result.operationId!==a.commit.operationId)throw Error('RESULT_MISMATCH');await this.resolved(s,'commitPublication',result);
  await this.reconcileState(s,actor,true);this.same(actor);return this.view(s);
 });}
 async abandon(documentId:string){return this.exclusive(async()=>{
  const actor=this.remote.publicationActor(),s=await this.store.load(actor.accountId,documentId);await this.reconcileState(s,actor,true);const a=s.attempt;if(!a?.publicationId||a.commit||a.abandon)throw Error('OPERATION_PENDING');
  a.abandon={operationId:randomUUID()};await this.record(s,'abandonPublication',a.abandon);const result=DTO.MutationResult.parse(await this.remote.publicationRequest(actor,'POST',`/publications/${a.publicationId}/abandon`,a.abandon));if(result.operationId!==a.abandon.operationId)throw Error('RESULT_MISMATCH');await this.resolved(s,'abandonPublication',result);await this.reconcileState(s,actor,true);this.same(actor);return this.view(s);
 });}
}
