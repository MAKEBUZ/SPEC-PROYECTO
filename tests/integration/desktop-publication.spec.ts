import {beforeAll,afterAll,it,expect} from 'vitest';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {startAccountHost,type AccountHost} from '../support/account-host.js';
import {AccountSession,type AccountState} from '../../apps/desktop/src/main/account-session.js';
import {HttpsAccountRemote} from '../../apps/desktop/src/main/account-remote.js';
import {PublicationRuntime} from '../../apps/desktop/src/main/publication/runtime.js';
import {PublicationStateStore} from '../../apps/desktop/src/main/publication/state-store.js';
import {DesktopJournalStorage} from '../../apps/desktop/src/main/operations/storage.js';
import {OperationJournal} from '../../packages/document/src/operations/journal.js';
import {OperationLifecycle} from '../../packages/document/src/operations/lifecycle.js';
import {newTimeCheck} from '../../packages/document/src/operations/time-check.js';
import {preparePublication} from '../../apps/desktop/src/main/publication/bundle.js';
import {revisionId} from '../../packages/document/src/revision.js';
import {DTO} from '../../packages/contracts/src/http-dto.js';
import {publishRevision} from '../support/publication-fixture.js';
let host:AccountHost;
it('requires explicit prior-account deletion proof without querying that account',async()=>{
 const root=await mkdtemp(join(tmpdir(),'desktop-deleted-account-'));try{
  const f=await setup(root),source={accountId:randomUUID(),patternId:randomUUID(),lastPublishedVersion:randomUUID()},document={...f.document,remoteBinding:source};let confirmed=false;
  const runtime=new PublicationRuntime(f.store(),f.account,{beginMutation:async()=>{},acceptOperation:async()=>{},publicationBlocked:async()=>false,publicationMayQuery:async()=>true,accountDeletionConfirmed:async id=>id===source.accountId&&confirmed});
  await expect(runtime.inspectConflict(document)).rejects.toThrow('ACCOUNT_MISMATCH');confirmed=true;
  const proof=await runtime.inspectConflict(document);expect(proof.kind).toBe('account-deleted-confirmed');await runtime.canResolveConflict(proof);expect(f.calls).toHaveLength(0);
  confirmed=false;await expect(runtime.canResolveConflict(proof)).rejects.toThrow('DELETION_UNCONFIRMED');
 }finally{await rm(root,{recursive:true,force:true});}
},30000);
beforeAll(async()=>{host=await startAccountHost();},30000);afterAll(async()=>{await host?.close();});
it('FR-130 blocks a new publication while its target project has an unknown mutation',async()=>{
 const root=await mkdtemp(join(tmpdir(),'desktop-project-dependency-'));try{
  const f=await setup(root),r=f.runtime(),created=await r.createProject(f.document.documentId,'Dependencia');
  await f.journal.create({accountId:f.a.accountId,operationId:randomUUID(),type:'trashProject',requestHash:'a'.repeat(64),state:'pending',pause:true,retryLevel:0,deadline:null,status:'ready',scopes:[{kind:'project',id:created.selectedProjectId!}]});
  await expect(r.publish(f.bundle,created.selectedProjectId!,'Bloqueado')).rejects.toThrow('OPERATION_PENDING');
  expect(f.calls.filter(c=>c.method==='POST'&&c.path==='/publications')).toHaveLength(0);
  expect((await f.store().load(f.a.accountId,f.document.documentId)).attempt).toBeUndefined();
 }finally{await rm(root,{recursive:true,force:true});}
},30000);
async function setup(root:string){
 const a=await host.verifiedAccount(),document={formatVersion:1 as const,documentId:randomUUID(),revisionId:'0'.repeat(64),units:'mm' as const,pieces:[],preparations:[]};document.revisionId=revisionId(document);
 const assets={wasm:await readFile('node_modules/@resvg/resvg-wasm/index_bg.wasm'),font:await readFile('.local/assets/NotoSans-Regular.ttf')},bundle=await preparePublication(Buffer.from(JSON.stringify(document)),'d.patron',assets);
 let accountState:AccountState={version:1,localEnabled:true,active:{credential:a.session.credential,view:DTO.SessionView.parse(a.session.view)},revocations:[],deletionChecks:[],allPending:null},drop='',dropped=false,online=true;
 const calls:{method:string;path:string}[]=[];
 const remote=new HttpsAccountRemote('https://patron.example.invalid',()=>online,async(input,init)=>{const url=new URL(String(input)),path=url.pathname.slice(3);calls.push({method:init!.method!,path});const response=await fetch(host.testBaseUrl+path+url.search,init);if(drop&&path.endsWith(drop)&&init?.method!=='GET'&&!dropped){dropped=true;await response.arrayBuffer();throw Error('RESPONSE_LOST');}return response;});
 const account=new AccountSession({load:async()=>accountState,save:async s=>{accountState=structuredClone(s);}},remote);await account.initialize();
 const store=()=>new PublicationStateStore(new DesktopJournalStorage(join(root,'attempts'))),journal=new OperationJournal(new DesktopJournalStorage(join(root,'journal')));
 const tracking=new OperationLifecycle({load:async()=>newTimeCheck(),save:async()=>{},clock:()=>({continuity:'test',now:performance.now()}),identifier:randomUUID,accounts:async()=>[],query:async()=>{throw Error('unused');},history:()=>({load:async()=>{throw Error('HISTORY_NOT_FOUND');},save:async()=>{}})},journal);
 const runtime=()=>new PublicationRuntime(store(),account,tracking);
 return {a,bundle,document,assets,store,journal,account,calls,runtime,drop:(suffix:string)=>{drop=suffix;dropped=false;},offline:()=>{online=false;}};
}
it('FR-130 includes the saved document binding even without a local publication binding',async()=>{
 const root=await mkdtemp(join(tmpdir(),'desktop-pattern-dependency-'));try{
  const f=await setup(root),r=f.runtime(),created=await r.createProject(f.document.documentId,'Importado');
  await r.publish(f.bundle,created.selectedProjectId!,'Original');await host.finishPublications();await r.reconcile(f.document.documentId);
  const binding=(await r.status(f.document.documentId)).binding!;
  const document={...f.document,remoteBinding:{accountId:binding.accountId,patternId:binding.patternId,lastPublishedVersion:binding.lastPublishedVersion}};document.revisionId=revisionId(document);
  const bundle=await preparePublication(Buffer.from(JSON.stringify(document)),'linked.patron',f.assets);
  await f.store().save({accountId:f.a.accountId,documentId:document.documentId});
  await f.journal.create({accountId:f.a.accountId,operationId:randomUUID(),type:'trashPattern',requestHash:'a'.repeat(64),state:'pending',pause:false,retryLevel:0,deadline:null,status:'unavailable',scopes:[{kind:'pattern',id:binding.patternId}]});
  const before=f.calls.filter(c=>c.method==='POST'&&c.path==='/publications').length;
  await expect(r.publish(bundle,created.selectedProjectId!,'Bloqueado')).rejects.toThrow('OPERATION_PENDING');
  expect(f.calls.filter(c=>c.method==='POST'&&c.path==='/publications')).toHaveLength(before);
 }finally{await rm(root,{recursive:true,force:true});}
},30000);
it('recovers lost begin and upload responses from disk without creating another publication',async()=>{
 const root=await mkdtemp(join(tmpdir(),'desktop-publication-'));try{
  const f=await setup(root),r=f.runtime(),created=await r.createProject(f.document.documentId,'Pruebas');expect(created.selectedProjectId).toBeTruthy();expect((await r.projects()).items.map(p=>p.id)).toContain(created.selectedProjectId);
  f.drop('/publications');await expect(r.publish(f.bundle,created.selectedProjectId!,'Patrón')).rejects.toThrow('RESPONSE_LOST');
  await expect(f.runtime().publish(f.bundle,created.selectedProjectId!,'Patrón')).rejects.toThrow('OPERATION_PENDING');
  await f.runtime().tick();expect((await f.runtime().status(f.document.documentId)).state).toBe('upload_ready');
  f.drop('/'+f.bundle.manifest.files[0]!.fileId);await expect(f.runtime().continueUpload(f.bundle)).rejects.toThrow('RESPONSE_LOST');
  await f.runtime().continueUpload(f.bundle);await host.finishPublications();await f.runtime().reconcile(f.document.documentId);
  const result=await f.runtime().status(f.document.documentId);expect(result.state).toBe('published');expect(result.binding?.revisionId).toBe(f.document.revisionId);
  expect(f.calls.filter(c=>c.method==='POST'&&c.path==='/publications')).toHaveLength(1);expect(f.calls.filter(c=>c.method==='POST'&&c.path.endsWith('/commit'))).toHaveLength(1);
  expect(f.calls.filter(c=>c.method==='PUT'&&c.path.endsWith(f.bundle.manifest.files[0]!.fileId))).toHaveLength(1);
  expect((await f.journal.inspect(f.a.accountId,true)).entries.every(e=>e.state==='resolved')).toBe(true);
  const before=f.calls.length;f.offline();await expect(f.runtime().reconcile(f.document.documentId)).rejects.toThrow();expect(f.calls).toHaveLength(before);
 }finally{await rm(root,{recursive:true,force:true});}
},30000);
it('reconciles a lost commit and a failed binding write without replay, preserving earlier versions',async()=>{
 const root=await mkdtemp(join(tmpdir(),'desktop-publication-'));try{
  const f=await setup(root),r=f.runtime(),project=await r.createProject(f.document.documentId,'Commit');f.drop('/commit');
  await expect(r.publish(f.bundle,project.selectedProjectId!,'Patrón')).rejects.toThrow('RESPONSE_LOST');await host.finishPublications();
  const store=f.store(),original=store.save.bind(store);store.save=async s=>{if(s.binding)throw Error('disk full');await original(s);};
  const failing=new PublicationRuntime(store,f.account,{beginMutation:async()=>{},acceptOperation:async()=>{},publicationBlocked:async()=>false,publicationMayQuery:async()=>true});
  await expect(failing.reconcile(f.document.documentId)).rejects.toThrow('disk full');expect((await f.store().load(f.a.accountId,f.document.documentId)).attempt?.commit).toBeDefined();
  await f.runtime().tick();const first=await f.runtime().status(f.document.documentId);expect(first.state).toBe('published');
  await f.runtime().publish(f.bundle,project.selectedProjectId!,'ignored');await host.finishPublications();await f.runtime().tick();const second=await f.runtime().status(f.document.documentId);
  expect(second.binding?.patternId).toBe(first.binding?.patternId);expect(second.binding?.lastPublishedVersion).not.toBe(first.binding?.lastPublishedVersion);
  expect((await host.pool.query('SELECT count(*) FROM versions WHERE pattern_id=$1',[first.binding!.patternId])).rows[0].count).toBe('2');
  expect(f.calls.filter(c=>c.method==='POST'&&c.path.endsWith('/commit'))).toHaveLength(2);
 }finally{await rm(root,{recursive:true,force:true});}
},30000);
it('recovers project creation after a lost response and hides all remote state after logout',async()=>{
 const root=await mkdtemp(join(tmpdir(),'desktop-publication-'));try{
  const f=await setup(root);f.drop('/projects');await expect(f.runtime().createProject(f.document.documentId,'Una vez')).rejects.toThrow('RESPONSE_LOST');
  await expect(f.runtime().createProject(f.document.documentId,'Otra vez')).rejects.toThrow('OPERATION_PENDING');await f.runtime().tick();expect((await f.runtime().status(f.document.documentId)).selectedProjectId).toBeTruthy();
  expect(f.calls.filter(c=>c.method==='POST'&&c.path==='/projects')).toHaveLength(1);await f.account.action('forgetSession',undefined);
  await expect(f.runtime().status(f.document.documentId)).rejects.toThrow('SESSION_REQUIRED');await expect(f.runtime().projects()).rejects.toThrow('SESSION_REQUIRED');
 }finally{await rm(root,{recursive:true,force:true});}
},30000);
it('reconciles a confirmed abandonment after a lost response without replay or deleting local content',async()=>{
 const root=await mkdtemp(join(tmpdir(),'desktop-publication-'));try{
  const f=await setup(root),project=await f.runtime().createProject(f.document.documentId,'Carga incompleta'),before=structuredClone(f.bundle);
  f.drop('/'+f.bundle.manifest.files[0]!.fileId);await expect(f.runtime().publish(f.bundle,project.selectedProjectId!,'Patrón')).rejects.toThrow('RESPONSE_LOST');
  f.drop('/abandon');await expect(f.runtime().abandon(f.document.documentId)).rejects.toThrow('RESPONSE_LOST');expect((await f.runtime().status(f.document.documentId)).state).toBe('abandon_pending');
  await f.runtime().tick();expect((await f.runtime().status(f.document.documentId)).state).toBe('local');expect(f.bundle).toEqual(before);expect(f.calls.filter(c=>c.method==='POST'&&c.path.endsWith('/abandon'))).toHaveLength(1);
  expect(Number((await host.accountRow(f.a.accountId)).reserved_bytes)).toBe(0);
 }finally{await rm(root,{recursive:true,force:true});}
},30000);
it('detects another published revision and downloads only the authorized selected editable',async()=>{
 const root=await mkdtemp(join(tmpdir(),'desktop-conflict-'));try{
  const f=await setup(root),r=f.runtime(),project=await r.createProject(f.document.documentId,'Conflicto');await r.publish(f.bundle,project.selectedProjectId!,'Patrón');await host.finishPublications();await r.reconcile(f.document.documentId);
  const first=(await r.status(f.document.documentId)).binding!;expect((await r.inspectConflict(f.document)).kind).toBe('current');
  const remote={...f.document,preparations:[{id:randomUUID(),name:'Cambio remoto',selection:[],transforms:{},mode:'large',paper:'A4',margin:10}]};
  const next=await publishRevision(host,f.a.session,remote,{projectId:first.projectId,patternId:first.patternId,versionId:first.lastPublishedVersion});
  const info=await r.inspectConflict(f.document);expect(info).toMatchObject({kind:'version-conflict',currentVersionId:next.versionId});const fetched=await r.downloadConflict(info);expect(JSON.parse(Buffer.from(fetched.bytes).toString())).toEqual(next.document);
  await host.pool.query("UPDATE patterns SET state='trashed',trashed_at=clock_timestamp(),expires_at=clock_timestamp()+interval '30 days' WHERE id=$1",[first.patternId]);
  expect((await r.inspectConflict(f.document)).kind).toBe('trashed');await expect(r.downloadConflict(info)).rejects.toThrow('CONFLICT_CHANGED');
  expect((await f.store().load(f.a.accountId,f.document.documentId)).binding).toEqual(first);
 }finally{await rm(root,{recursive:true,force:true});}
},30000);
