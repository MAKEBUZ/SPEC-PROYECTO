import { expect,it,vi,afterEach } from 'vitest';
import { AccountClient } from '../../packages/account-ui/src/client.js';
import { watchDeletionChecks } from '../../packages/account-ui/src/deletion-watch.js';
afterEach(()=>vi.unstubAllGlobals());
it('keeps one root watch across account screen changes and reconnects outside the account screen',async()=>{
  const events=new EventTarget();let online=true,calls=0;
  vi.stubGlobal('window',events);vi.stubGlobal('navigator',{get onLine(){return online;}});
  const client=new AccountClient({request:async()=>{calls++;return {status:200,body:[]};}},{load:()=>[],save:()=>{}});
  const root=watchDeletionChecks(client,()=>{}),screen=watchDeletionChecks(client,()=>{});
  await screen.checkNow();expect(calls).toBe(1);screen.dispose();
  online=false;events.dispatchEvent(new Event('offline'));online=true;events.dispatchEvent(new Event('online'));
  await root.checkNow();expect(calls).toBe(2);
  const reopened=watchDeletionChecks(client,()=>{});expect(calls).toBe(2);reopened.dispose();root.dispose();
  events.dispatchEvent(new Event('online'));expect(calls).toBe(2);
});
it('discards page-hidden replies and checks again after restoring the application',async()=>{
  const events=new EventTarget();vi.stubGlobal('window',events);vi.stubGlobal('navigator',{onLine:true});
  let calls=0,resolve!:(reply:{status:number;body:unknown})=>void;
  const received:unknown[]=[];
  const client=new AccountClient({request:()=>{calls++;return new Promise(r=>{resolve=r;});}},{load:()=>[],save:()=>{}});
  const watch=watchDeletionChecks(client,s=>received.push(s));
  events.dispatchEvent(new Event('pagehide'));events.dispatchEvent(new Event('pageshow'));
  resolve({status:200,body:[]});await new Promise(r=>setTimeout(r,0));
  expect(calls).toBe(2);expect(received).toHaveLength(1);
  resolve({status:200,body:[]});await watch.checkNow();expect(received).toHaveLength(2);watch.dispose();
});
