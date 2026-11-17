import {it,expect} from 'vitest';
import {OperationJournal,type LocalOperation} from '../../packages/document/src/operations/journal.js';
import {PendingQueries} from '../../packages/document/src/operations/pending.js';
import {scopesConflict} from '../../packages/document/src/operations/scopes.js';
const accountId='11111111-1111-4111-8111-111111111111';
function fixture(){
 const records=new Map<string,string[]>();
 const journal=new OperationJournal({keys:async()=>[...records.keys()],read:async k=>records.get(k)??[],append:async(k,old,value)=>{records.set(k,[...old,value]);}});
 const operation:LocalOperation={accountId,operationId:crypto.randomUUID(),type:'commitPublication',requestHash:'a'.repeat(64),state:'pending',pause:false,status:'ready',retryLevel:0,deadline:null,scopes:[{kind:'pattern',id:'pattern-a'},{kind:'project-member',id:'project-a'}]};
 return {journal,records,operation};
}
it('FR-130 blocks project dependencies but permits independent patterns in the same project',async()=>{
 const f=fixture();await f.journal.create(f.operation);const pending=new PendingQueries(f.journal,{query:async()=>{throw Error('must not query');}});
 expect(await pending.blocked(accountId,[{kind:'project',id:'project-a'}])).toBe(true);
 expect(await pending.blocked(accountId,[{kind:'pattern',id:'pattern-a'}])).toBe(true);
 expect(await pending.blocked(accountId,[{kind:'pattern',id:'pattern-b'},{kind:'project-member',id:'project-a'}])).toBe(false);
 expect(await pending.blocked(accountId,[{kind:'project',id:'project-b'}])).toBe(false);
 expect(await pending.blocked(accountId,[{kind:'account',id:accountId}])).toBe(true);
});
it.each(['operationId','operationType'])('FR-126/134 rejects evidence with mismatched %s and retains its blocks',async field=>{
 const f=fixture();await f.journal.create(f.operation);
 const reply={operationId:f.operation.operationId,operationType:f.operation.type,state:'resolved',outcome:'success',confirmedAt:'2026-11-16T00:00:00Z',authorizedResourceRefs:[],actorLabel:'Propietario', [field]:field==='operationId'?crypto.randomUUID():'purgePattern'};
 const pending=new PendingQueries(f.journal,{query:async()=>reply});
 await pending.check(f.operation.operationId,{accountId,sessionValid:true,online:true,continuity:'boot',now:0,receivedAt:0});
 expect((await f.journal.record(accountId,f.operation.operationId)).value).toMatchObject({state:'pending',retryLevel:1,deadline:1000});
 expect(await pending.blocked(accountId,f.operation.scopes)).toBe(true);
});
it('FR-129/131 shares in-flight checks and preserves a pause made while the result is arriving',async()=>{
 const f=fixture();await f.journal.create(f.operation);let calls=0,release!:(v:unknown)=>void,started!:()=>void;
 const ready=new Promise<void>(r=>{started=r;});let now=0;
 const pending=new PendingQueries(f.journal,{query:()=>{calls++;started();return new Promise(r=>{release=r;});}});
 const context={accountId,sessionValid:true,online:true,continuity:'boot',now:0,receivedAt:0,currentTime:()=>({now,receivedAt:now,continuity:'boot'})};
 const first=pending.check(f.operation.operationId,context);await ready;
 await pending.check(f.operation.operationId,context,true);await pending.pause(accountId,f.operation.operationId,true);
 now=4000;release({operationId:f.operation.operationId,operationType:f.operation.type,state:'pending',authorizedResourceRefs:[],actorLabel:'Propietario'});await first;
 expect(calls).toBe(1);expect((await f.journal.record(accountId,f.operation.operationId)).value).toMatchObject({state:'pending',pause:true,deadline:5000});
 await pending.check(f.operation.operationId,{...context,now:1e9});expect(calls).toBe(1);
});
it('FR-140/231 a query completing after account closure cannot revive or rewrite the closed record',async()=>{
 const f=fixture();await f.journal.create(f.operation);let release!:(v:unknown)=>void,started!:()=>void;
 const ready=new Promise<void>(r=>{started=r;});
 const pending=new PendingQueries(f.journal,{query:()=>{started();return new Promise(r=>{release=r;});}});
 const first=pending.check(f.operation.operationId,{accountId,sessionValid:true,online:true,continuity:'boot',now:0,receivedAt:0});await ready;
 await f.journal.update(accountId,f.operation.operationId,r=>({...r,state:'closed',closedAt:10}));
 release({operationId:f.operation.operationId,operationType:f.operation.type,state:'resolved',outcome:'success',confirmedAt:'2026-11-16T00:00:00Z',authorizedResourceRefs:[],actorLabel:'Propietario'});await first;
 expect((await f.journal.record(accountId,f.operation.operationId)).value).toMatchObject({state:'closed',closedAt:10});
 expect((await f.journal.record(accountId,f.operation.operationId)).value?.outcome).toBeUndefined();
});
it('FR-130 project dependency conflicts are symmetric and do not confuse resource kinds',()=>{
 const parent=[{kind:'project',id:'a'}],member=[{kind:'project-member',id:'a'}];
 expect(scopesConflict(parent,member)).toBe(true);expect(scopesConflict(member,parent)).toBe(true);
 expect(scopesConflict(member,member)).toBe(false);expect(scopesConflict(parent,[{kind:'pattern',id:'a'}])).toBe(false);
});
it('FR-127/131/223 reopening preserves pause and rejects queries from another account or invalid session',async()=>{
 const f=fixture();await f.journal.create({...f.operation,pause:true});let calls=0;
 const pending=new PendingQueries(f.journal,{query:async()=>{calls++;throw Error('network');}});
 const context={accountId,sessionValid:true,online:true,continuity:'boot',now:0,receivedAt:0};
 await pending.check(f.operation.operationId,context);
 await pending.check(f.operation.operationId,{...context,accountId:crypto.randomUUID()},true);
 await pending.check(f.operation.operationId,{...context,sessionValid:false},true);
 await pending.check(f.operation.operationId,{...context,online:false},true);
 expect(calls).toBe(0);expect((await f.journal.record(accountId,f.operation.operationId)).value?.pause).toBe(true);
 await pending.check(f.operation.operationId,context,true);expect(calls).toBe(1);
 expect((await f.journal.record(accountId,f.operation.operationId)).value?.pause).toBe(true);
});
it('FR-132/133/135 failed result lookup retains dependency blocks and manual checking',async()=>{
 for(const code of ['ACCESS_DENIED','OPERATION_RESULT_UNAVAILABLE']){
  const f=fixture();await f.journal.create(f.operation);let calls=0;
  const pending=new PendingQueries(f.journal,{query:async()=>{calls++;throw {code};}});
  const context={accountId,sessionValid:true,online:true,continuity:'boot',now:0,receivedAt:0};
  await pending.check(f.operation.operationId,context);await pending.check(f.operation.operationId,{...context,now:1e9});
  expect(calls).toBe(1);expect(await pending.blocked(accountId,[{kind:'project',id:'project-a'}])).toBe(true);
  await pending.check(f.operation.operationId,context,true);expect(calls).toBe(2);
  await expect(f.journal.update(accountId,f.operation.operationId,()=>null)).rejects.toThrow('PENDING_CANNOT_BE_REMOVED');
 }
});
