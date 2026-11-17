import {it,expect,vi,afterEach} from 'vitest';
import {authorizeAccess,type Credential} from '../../apps/api/src/http/access.js';
import {DeletionCheckController} from '../../packages/account-ui/src/deletion-check-controller.js';
const requestId='80000000-0000-4000-8000-000000000001';
afterEach(()=>vi.useRealTimers());
it('SC-280/283 two devices recover independently without turning a lost response into deletion',async()=>{
 vi.useFakeTimers();let calls=0;const first:unknown[]=[],second:unknown[]=[];
 const deleted={requestId,state:'deleted',confirmedAt:'2026-01-01T00:00:00.000Z',checkExpiresAt:'2026-04-01T00:00:00.000Z'};
 const a=new DeletionCheckController({query:async()=>{if(++calls===1)throw Error('response lost');return [deleted];},result:rows=>first.push(...rows),failure:()=>{}});
 const b=new DeletionCheckController({query:async()=>[deleted],result:rows=>second.push(...rows),failure:()=>{}});
 try{
  a.start(true);b.start(true);await vi.advanceTimersByTimeAsync(0);
  expect(first).toEqual([]);expect(second).toEqual([deleted]);
  await vi.advanceTimersByTimeAsync(4999);expect(first).toEqual([]);
  await vi.advanceTimersByTimeAsync(1);expect(first).toEqual([deleted]);expect(second).toEqual([deleted]);expect(calls).toBe(2);
 }finally{a.stop();b.stop();}
});
it('SC-283 caps growing waits and resets only after a successful query; stopped devices never retry',async()=>{
 vi.useFakeTimers();let calls=0,fail=true,results=0;
 const c=new DeletionCheckController({query:async()=>{calls++;if(fail)throw Error('network');return [{requestId,state:'pending'}];},result:()=>{results++;},failure:()=>{}});
 try{
  c.start(true);await vi.advanceTimersByTimeAsync(0);
  for(const wait of [5000,10000,20000,40000,80000,120000,120000]){const before=calls;await vi.advanceTimersByTimeAsync(wait-1);expect(calls).toBe(before);await vi.advanceTimersByTimeAsync(1);expect(calls).toBe(before+1);expect(results).toBe(0);}
  fail=false;await c.checkNow();expect(results).toBe(1);
  fail=true;await c.checkNow();const before=calls;
  await vi.advanceTimersByTimeAsync(4999);expect(calls).toBe(before);await vi.advanceTimersByTimeAsync(1);expect(calls).toBe(before+1);
  c.stop();await vi.advanceTimersByTimeAsync(1000000);expect(calls).toBe(before+1);
 }finally{c.stop();}
});
it('SC-278 rejects the exact 90-day boundary, not just a later day, without extending the capability',()=>{
 const confirmed=Date.parse('2026-01-01T00:00:00Z'),expiresAt=confirmed+90*86400000;
 const credential:Credential={kind:'deletion',requestId,expiresAt};
 expect(()=>authorizeAccess('deletion_credential',credential,expiresAt-1,requestId)).not.toThrow();
 expect(()=>authorizeAccess('deletion_credential',credential,expiresAt,requestId)).toThrow();
 expect(()=>authorizeAccess('deletion_credential',credential,expiresAt+1,requestId)).toThrow();
 expect(credential.expiresAt).toBe(expiresAt);
 expect(()=>authorizeAccess('normal',credential,confirmed,requestId)).toThrow();
});
it.each(['expired','invalid','response lost'])('SC-277/278 does not produce cleanup evidence from %s',async message=>{
 let confirmations=0,failures=0;
 const controller=new DeletionCheckController({query:async()=>{throw Error(message);},result:()=>{confirmations++;},failure:()=>{failures++;}});
 controller.start(true);await controller.checkNow();controller.stop();expect(confirmations).toBe(0);expect(failures).toBe(1);
});
it('SC-279 relays cancelled as cancelled, without converting it into deletion or creating a normal session',async()=>{
 const result={requestId,state:'cancelled',confirmedAt:'2026-01-01T00:00:00.000Z',checkExpiresAt:'2026-04-01T00:00:00.000Z'};
 const received:unknown[]=[];const controller=new DeletionCheckController({query:async()=>[result],result:rows=>{received.push(...rows);},failure:()=>{throw Error('unexpected');}});
 controller.start(true);await controller.checkNow();controller.stop();expect(received).toEqual([result]);
});
