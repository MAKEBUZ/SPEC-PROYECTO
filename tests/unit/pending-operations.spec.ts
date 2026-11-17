import { it,expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { OperationJournal } from '../../packages/document/src/operations/journal.js';
import type { LocalOperation,JournalStorage } from '../../packages/document/src/operations/journal.js';
import { PendingQueries } from '../../packages/document/src/operations/pending.js';
function setup(){const records=new Map<string,string[]>(),store:JournalStorage={keys:async()=>[...records.keys()],read:async k=>structuredClone(records.get(k)??[]),append:async(k,expected,value)=>{if(JSON.stringify(records.get(k)??[])!==JSON.stringify(expected))throw new Error('CONFLICT');records.set(k,[...expected,value]);}},journal=new OperationJournal(store),p:LocalOperation={operationId:randomUUID(),accountId:randomUUID(),requestHash:'a'.repeat(64),type:'commitPublication',state:'pending',pause:false,retryLevel:0,deadline:null,status:'ready',scopes:[{kind:'pattern',id:randomUUID()}]};return {journal,p,context:{accountId:p.accountId,sessionValid:true,online:true,continuity:'boot',now:0,receivedAt:1000}};}
it('preserves pauses and dependency blocks after a permission error, and resolves only an identified result',async()=>{
  const {journal,p,context}=setup();await journal.create(p);let calls=0,allow=false;
  const queries=new PendingQueries(journal,{query:async()=>{calls++;if(!allow)throw {code:'ACCESS_DENIED'};return {operationId:p.operationId,operationType:p.type,state:'resolved',outcome:'success',confirmedAt:new Date(900).toISOString(),authorizedResourceRefs:[],actorLabel:'Propietario'};}});
  await queries.check(p.operationId,context);await queries.check(p.operationId,{...context,now:100000});expect(calls).toBe(1);expect(await queries.blocked(p.accountId,p.scopes)).toBe(true);expect(await queries.blocked(p.accountId,[{kind:'pattern',id:randomUUID()}])).toBe(false);
  await queries.pause(p.accountId,p.operationId,true);allow=true;await queries.check(p.operationId,context,true);expect(calls).toBe(2);expect(await queries.blocked(p.accountId,p.scopes)).toBe(false);expect((await journal.inspect(p.accountId,true)).entries[0]).toMatchObject({state:'resolved',pause:true,receivedAt:1000});
});
it('does not query offline, for another account, or while the same query is running',async()=>{
  const {journal,p,context}=setup();await journal.create(p);let release!:(v:unknown)=>void,calls=0;
  const queries=new PendingQueries(journal,{query:async()=>{calls++;return new Promise(r=>{release=r;});}});
  await queries.check(p.operationId,{...context,online:false},true);await queries.check(p.operationId,{...context,accountId:randomUUID()},true);expect(calls).toBe(0);
  const running=queries.check(p.operationId,context,true);while(!release)await new Promise(r=>setTimeout(r,0));await queries.check(p.operationId,context,true);expect(calls).toBe(1);
  release({operationId:p.operationId,operationType:p.type,state:'pending',authorizedResourceRefs:[],actorLabel:'Propietario'});await running;expect((await journal.inspect(p.accountId,true)).entries[0]!.deadline).toBe(1000);
});
it('preserves an automatic pause across new coordinators while allowing a manual check',async()=>{
  const {journal,p,context}=setup();await journal.create(p);let calls=0;
  const port={query:async()=>{calls++;throw {code:'OPERATION_RESULT_UNAVAILABLE'};}};
  await new PendingQueries(journal,port).pause(p.accountId,p.operationId,true);
  const reopened=new PendingQueries(journal,port);
  await reopened.check(p.operationId,context);expect(calls).toBe(0);
  await reopened.check(p.operationId,context,true);
  expect((await journal.inspect(p.accountId,true)).entries[0]).toMatchObject({pause:true,status:'unavailable',state:'pending'});
  await reopened.pause(p.accountId,p.operationId,false);
  await reopened.check(p.operationId,{...context,now:999999});expect(calls).toBe(1);
  expect(await reopened.blocked(p.accountId,p.scopes)).toBe(true);
});
it('uses growing query waits, preserves the level on reopen and resets an uncertain wait conservatively',async()=>{
  const {journal,p,context}=setup();await journal.create(p);let calls=0;
  const port={query:async()=>{calls++;throw Error('NETWORK');}};
  const first=new PendingQueries(journal,port);await first.check(p.operationId,context);
  await first.check(p.operationId,{...context,now:999});expect(calls).toBe(1);
  const reopened=new PendingQueries(journal,port);
  await reopened.check(p.operationId,{...context,continuity:'new-boot',now:50});expect(calls).toBe(1);
  expect((await journal.inspect(p.accountId,true)).entries[0]).toMatchObject({retryLevel:1,deadline:1050,retryContinuity:'new-boot'});
  await reopened.check(p.operationId,{...context,continuity:'new-boot',now:1050});expect(calls).toBe(2);
  expect((await journal.inspect(p.accountId,true)).entries[0]).toMatchObject({retryLevel:2,deadline:3050});
});
it('rejects a result for another operation and never turns it into a retryable failure',async()=>{
  const {journal,p,context}=setup();await journal.create(p);
  const queries=new PendingQueries(journal,{query:async()=>({operationId:randomUUID(),operationType:p.type,state:'resolved',outcome:'failure',confirmedAt:new Date(900).toISOString(),authorizedResourceRefs:[],actorLabel:'Propietario'})});
  await queries.check(p.operationId,context);
  expect((await journal.inspect(p.accountId,true)).entries[0]).toMatchObject({state:'pending',retryLevel:1});
  expect(await queries.blocked(p.accountId,p.scopes)).toBe(true);
});
it('records a confirmed failure without replaying the mutation or polling the resolved operation',async()=>{
  const {journal,p,context}=setup();await journal.create(p);let calls=0;
  const queries=new PendingQueries(journal,{query:async()=>{calls++;return {operationId:p.operationId,operationType:p.type,state:'resolved',outcome:'failure',confirmedAt:new Date(900).toISOString(),authorizedResourceRefs:[],actorLabel:'Propietario'};}});
  await queries.check(p.operationId,context);await queries.check(p.operationId,context,true);
  expect(calls).toBe(1);expect(await queries.blocked(p.accountId,p.scopes)).toBe(false);
  expect((await journal.inspect(p.accountId,true)).entries[0]).toMatchObject({state:'resolved',outcome:'failure',receivedAt:1000});
});
