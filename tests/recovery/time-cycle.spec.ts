import { expect,it } from 'vitest';
import { TimeCheckCycle } from '../../packages/document/src/operations/time-cycle.js';
import { newTimeCheck,type TimeCheckState } from '../../packages/document/src/operations/time-check.js';
function harness(){
  let now=0,id=0,calls=0,failSave=false,durable=newTimeCheck(),continuity='boot';
  let resolve!:(value:unknown)=>void;
  const cycle=new TimeCheckCycle({load:async()=>structuredClone(durable),save:async s=>{if(failSave)throw Error('disk');durable=structuredClone(s);},clock:()=>({now,continuity}),identifier:()=>String(++id),query:async nonce=>{calls++;return new Promise(r=>{resolve=value=>r({...value as object,nonce});});}});
  return {cycle,now:(n:number)=>{now=n;},continuity:(v:string)=>{continuity=v;},fail:(v:boolean)=>{failSave=v;},calls:()=>calls,durable:()=>durable,
    respond:async()=>{resolve({responseId:'80000000-0000-4000-8000-000000000001',serverReceivedAt:'2026-11-15T00:00:00.000Z',serverSentAt:'2026-11-15T00:00:00.001Z'});await new Promise(r=>setTimeout(r,0));await cycle.idle();}};
}
it('persists the query marker before transport and commits valid evidence before completion',async()=>{
  const h=harness();await h.cycle.initialize();await h.cycle.tick({open:true,online:true});
  expect(h.durable().phase).toBe('querying');expect(h.calls()).toBe(1);
  await h.cycle.tick({open:true,online:true});expect(h.calls()).toBe(1);
  h.now(10);await h.respond();expect(h.cycle.state.phase).toBe('complete');expect(h.durable().phase).toBe('complete');
});
it('persists a fresh full wait after uncertain suspension time without another failure',async()=>{
  const h=harness();await h.cycle.initialize();await h.cycle.tick({open:true,online:true});h.now(100);await h.cycle.interrupt('suspend');
  h.now(20);h.continuity('uncertain');await h.cycle.tick({open:true,online:true});
  expect(h.durable().wait).toEqual({continuity:'uncertain',started:20,duration:5000});expect(h.durable().failures).toBe(1);
  h.now(5019);await h.cycle.tick({open:true,online:true});expect(h.calls()).toBe(1);
  h.now(5020);await h.cycle.tick({open:true,online:true});expect(h.calls()).toBe(2);await h.cycle.interrupt('close');
});
it('keeps received evidence in memory and retries storage offline without another query',async()=>{
  const h=harness();await h.cycle.initialize();await h.cycle.tick({open:true,online:true});h.fail(true);h.now(10);await h.respond();
  expect(h.cycle.state.phase).toBe('save_pending');expect(h.durable().phase).toBe('querying');
  h.fail(false);h.now(5010);await h.cycle.tick({open:true,online:false});
  expect(h.cycle.state.phase).toBe('complete');expect(h.calls()).toBe(1);
});
it('discards disconnected responses, persists one failure and respects the remaining wait',async()=>{
  const h=harness();await h.cycle.initialize();await h.cycle.tick({open:true,online:true});h.now(100);
  await h.cycle.interrupt('disconnect');await h.cycle.interrupt('disconnect');await h.respond();
  expect(h.durable().failures).toBe(1);expect(h.durable().phase).toBe('pending');
  h.now(5099);await h.cycle.tick({open:true,online:true});expect(h.calls()).toBe(1);
  h.now(5100);await h.cycle.tick({open:true,online:true});expect(h.calls()).toBe(2);
  await h.cycle.interrupt('close');
});
it('never queries when persisting the start marker fails',async()=>{
  const h=harness();await h.cycle.initialize();h.fail(true);
  await expect(h.cycle.tick({open:true,online:true})).rejects.toThrow('disk');expect(h.calls()).toBe(0);
  expect(h.cycle.storageBlocked).toBe(true);
  h.fail(false);h.now(90000);await h.cycle.tick({open:true,online:true});
  expect(h.calls()).toBe(0);expect(h.cycle.state.failures).toBe(0);
  await h.cycle.tick({open:true,online:true});expect(h.calls()).toBe(1);
  await h.cycle.interrupt('close');
});
