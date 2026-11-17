import {it,expect} from 'vitest';
import {OperationJournal,type LocalOperation} from '../../packages/document/src/operations/journal.js';
import {OperationsHistory,RESOLVED_RETENTION_MS} from '../../packages/document/src/operations/history-panel.js';
function setup(){
 const records=new Map<string,string[]>(),journal=new OperationJournal({keys:async()=>[...records.keys()],read:async k=>records.get(k)??[],append:async(k,old,v)=>{records.set(k,[...old,v]);},compact:async()=>{}});
 const accountId=crypto.randomUUID(),sessionId=crypto.randomUUID();let valid=true,online=false,now=1000;
 let query:(op:Readonly<LocalOperation>)=>Promise<unknown>=async()=>{throw Error('unexpected network');};
 const context=()=>({accountId,sessionId,valid,online});
 const service=new OperationsHistory(journal,{auth:async()=>context(),allowed:async()=>true,clock:()=>({now:performance.now(),continuity:'boot',receivedAt:now}),query:op=>query(op)});
 const entry:LocalOperation={accountId,operationId:crypto.randomUUID(),type:'updateProfile',requestHash:'a'.repeat(64),state:'pending',pause:false,retryLevel:0,deadline:null,status:'ready',scopes:[]};
 return {service,journal,entry,context,setQuery:(q:typeof query)=>{query=q;},setValid:(v:boolean)=>{valid=v;},setOnline:(v:boolean)=>{online=v;},setTime:(v:number)=>{now=v;}};
}
it('hides entries and quantities after logout and keeps pending operations when cleaning resolved ones offline',async()=>{
 const f=setup();await f.journal.create(f.entry);const resolved={...f.entry,operationId:crypto.randomUUID()};await f.journal.create(resolved);await f.journal.update(resolved.accountId,resolved.operationId,r=>({...r,state:'resolved',outcome:'failure',confirmedAt:'2026-11-16T00:00:00Z',receivedAt:1000}));
 const view=await f.service.view();expect(view.pending).toHaveLength(1);expect(view.resolved).toHaveLength(1);
 const scope=await f.service.prepareClear([resolved.operationId]);f.setValid(false);
 expect(await f.service.view()).toEqual({visible:false,pending:[],resolved:[],damaged:false,settledLegacyIds:[]});
 await expect(f.service.confirmClear(scope.scopeId)).rejects.toThrow('SESSION_REQUIRED');
 f.setValid(true);const fresh=await f.service.prepareClear([resolved.operationId]);await f.service.confirmClear(fresh.scopeId);
 expect((await f.service.view()).pending).toHaveLength(1);expect((await f.service.view()).resolved).toEqual([]);
});
it('migrates legacy identities once and never recreates a removed operation',async()=>{
 const f=setup(),legacy=[{accountId:f.entry.accountId,operationId:f.entry.operationId,operationType:'updateProfile'}];
 expect((await f.service.view(legacy)).pending).toHaveLength(1);expect((await f.service.view(legacy)).pending).toHaveLength(1);
 await f.journal.update(f.entry.accountId,f.entry.operationId,r=>({...r,state:'resolved',outcome:'failure',confirmedAt:'2026-11-16T00:00:00Z',receivedAt:1000}));
 const scope=await f.service.prepareClear([f.entry.operationId]);await f.service.confirmClear(scope.scopeId);
 const view=await f.service.view(legacy);expect(view.pending).toEqual([]);expect(view.settledLegacyIds).toEqual([f.entry.operationId]);
});
it('cleaning uses the confirmed scope, excluding results that arrived while the dialog was open',async()=>{
 const f=setup();await f.journal.create(f.entry);await f.journal.update(f.entry.accountId,f.entry.operationId,r=>({...r,state:'resolved',outcome:'failure',confirmedAt:'2026-11-16T00:00:00Z',receivedAt:1000}));
 const scope=await f.service.prepareClear([f.entry.operationId]);const later={...f.entry,operationId:crypto.randomUUID()};await f.journal.create(later);await f.journal.update(later.accountId,later.operationId,r=>({...r,state:'resolved',outcome:'success',confirmedAt:'2026-11-16T00:00:00Z',receivedAt:1000}));
 await f.service.confirmClear(scope.scopeId);expect((await f.service.view()).resolved.map(r=>r.operationId)).toEqual([later.operationId]);
});
it('records a confirmed in-flight result after logout, hides it and does not replay or extend it on login',async()=>{
 const f=setup();f.setOnline(true);await f.journal.create(f.entry);let release!:(v:unknown)=>void;
 f.setQuery(()=>new Promise(r=>{release=r;}));const running=f.service.check(f.entry.operationId);while(!release)await new Promise(r=>setTimeout(r,0));
 f.setValid(false);release({operationId:f.entry.operationId,operationType:f.entry.type,state:'resolved',outcome:'failure',confirmedAt:'2026-11-16T00:00:00Z',authorizedResourceRefs:[],actorLabel:'Propietario'});await running;
 expect((await f.service.view()).visible).toBe(false);f.setTime(2000);f.setValid(true);expect((await f.service.view()).resolved[0]!.receivedAt).toBe(1000);
 expect((await f.service.retry(f.entry.operationId)).operationId).toBe(f.entry.operationId);f.setOnline(false);await expect(f.service.retry(f.entry.operationId)).rejects.toThrow('SESSION_REQUIRED');
});
it('expires at thirty days without extending first receipt and never removes unknown results',async()=>{
 const f=setup();await f.journal.create(f.entry);await f.journal.update(f.entry.accountId,f.entry.operationId,r=>({...r,state:'resolved',outcome:'success',confirmedAt:'2026-11-16T00:00:00Z',receivedAt:1000}));
 f.setTime(1000+RESOLVED_RETENTION_MS-1);expect((await f.service.view()).resolved).toHaveLength(1);
 f.setTime(1000+RESOLVED_RETENTION_MS);expect((await f.service.view()).resolved).toEqual([]);
 await expect(f.service.retry(f.entry.operationId)).rejects.toThrow();
});
it('shares background polling, respects pauses and stops new queries when the application closes',async()=>{
 const f=setup();f.setOnline(true);await f.journal.create(f.entry);let calls=0,release!:(v:unknown)=>void,open=true;
 f.setQuery(()=>{calls++;return new Promise(r=>{release=r;});});
 await f.service.pause(f.entry.operationId,true);await f.service.poll();expect(calls).toBe(0);await f.service.pause(f.entry.operationId,false);
 const first=f.service.poll(()=>open);expect(f.service.poll(()=>open)).toBe(first);while(!release)await new Promise(r=>setTimeout(r,0));open=false;
 release({operationId:f.entry.operationId,operationType:f.entry.type,state:'resolved',outcome:'success',confirmedAt:'2026-11-16T00:00:00Z',authorizedResourceRefs:[],actorLabel:'Propietario'});await first;await f.service.poll(()=>open);expect(calls).toBe(1);expect((await f.service.view()).resolved).toHaveLength(1);
});
