import { expect,it,vi,afterEach } from 'vitest';
import { DeletionCheckController } from '../../packages/account-ui/src/deletion-check-controller.js';
import { AccountClient } from '../../packages/account-ui/src/client.js';
afterEach(()=>vi.useRealTimers());
const pending=[{requestId:'80000000-0000-4000-8000-000000000001',state:'pending'}];
it('keeps independently confirmed rows while retrying a partially failed batch',async()=>{
 vi.useFakeTimers();let calls=0,failures=0;const results:unknown[]=[];
 const c=new DeletionCheckController({query:async()=>{calls++;return {rows:pending,failed:true};},result:rows=>results.push(rows),failure:()=>{failures++;}});
 c.start(true);await vi.advanceTimersByTimeAsync(0);expect(results).toEqual([pending]);expect(failures).toBe(1);
 await vi.advanceTimersByTimeAsync(5000);expect(calls).toBe(2);expect(failures).toBe(2);
 await vi.advanceTimersByTimeAsync(9999);expect(calls).toBe(2);await vi.advanceTimersByTimeAsync(1);expect(calls).toBe(3);c.stop();
});
it('discards a disconnected attempt and queries afresh after reconnecting',async()=>{
 let release!:(v:unknown)=>void,calls=0,results=0;
 const c=new DeletionCheckController({query:()=>{calls++;return new Promise(r=>{release=r;});},result:()=>{results++;},failure:()=>{}});
 c.start(true);const first=c.checkNow();c.connect(false);release(pending);await first;expect(results).toBe(0);expect(calls).toBe(1);
 c.connect(true);const second=c.checkNow();release(pending);await second;expect(results).toBe(1);expect(calls).toBe(2);c.stop();
});
it('shares automatic/manual checks without queuing duplicate requests',async()=>{
  let release!:(v:unknown)=>void,calls=0;const received:unknown[]=[];
  const c=new DeletionCheckController({query:()=>{calls++;return new Promise(r=>{release=r;});},result:r=>received.push(r),failure:()=>{}});
  c.start(true);const manual=c.checkNow();c.connect(true);expect(calls).toBe(1);release(pending);await manual;
  expect(received).toEqual([pending]);expect(calls).toBe(1);c.stop();
});
it('retries failed queries with increasing waits and keeps manual checks available',async()=>{
  vi.useFakeTimers();let calls=0,errors=0;
  const c=new DeletionCheckController({query:async()=>{calls++;throw Error('offline');},result:()=>{},failure:()=>{errors++;}});
  c.start(true);await vi.advanceTimersByTimeAsync(0);expect(calls).toBe(1);
  await vi.advanceTimersByTimeAsync(4999);expect(calls).toBe(1);
  await vi.advanceTimersByTimeAsync(1);expect(calls).toBe(2);
  await vi.advanceTimersByTimeAsync(9999);expect(calls).toBe(2);
  await c.checkNow();expect(calls).toBe(3);expect(errors).toBe(3);c.stop();
});
it('does not query offline or deliver late results after stopping',async()=>{
  let release!:(v:unknown)=>void,calls=0,results=0;
  const c=new DeletionCheckController({query:()=>{calls++;return new Promise(r=>{release=r;});},result:()=>{results++;},failure:()=>{}});
  c.start(false);await c.checkNow();expect(calls).toBe(0);
  c.connect(true);expect(calls).toBe(1);c.stop();release(pending);await Promise.resolve();await Promise.resolve();expect(results).toBe(0);
});
it('rejects malformed replies and cannot infer deleted status from errors',async()=>{
  let results=0,errors=0;
  const c=new DeletionCheckController({query:async()=>[{state:'deleted'}],result:()=>{results++;},failure:()=>{errors++;}});
  c.start(true);await c.checkNow();expect(results).toBe(0);expect(errors).toBe(1);c.stop();
});
it('shares the transport across account-screen remounts and releases it after failure',async()=>{
  let calls=0,reject!:(reason:unknown)=>void;
  const client=new AccountClient({request:()=>{calls++;return new Promise((_,r)=>{reject=r;});}},{load:()=>[],save:()=>{}});
  const first=client.query('checks'),second=client.query('checks');expect(calls).toBe(1);
  reject(Error('network'));expect((await Promise.allSettled([first,second])).map(r=>r.status)).toEqual(['rejected','rejected']);
  const retry=client.query('checks');expect(calls).toBe(2);reject(Error('network'));await expect(retry).rejects.toThrow('network');
});
