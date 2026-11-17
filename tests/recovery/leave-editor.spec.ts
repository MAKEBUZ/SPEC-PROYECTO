import { it,expect } from 'vitest';
import { LeaveGuard } from '../../apps/desktop/src/main/documents/leave-guard.js';
it.each(['save','discard','cancel'] as const)('honours %s without conflating discard with save',async choice=>{
  let dirty=true,left=false,saved=false;const result=await new LeaveGuard().run({dirty:()=>dirty,choose:async()=>choice,save:async()=>{saved=true;dirty=false;return true;},leave:async()=>{left=true;}});
  expect(result).toBe(choice!=='cancel');expect(left).toBe(choice!=='cancel');expect(saved).toBe(choice==='save');
});
it('failed or cancelled save preserves the active document',async()=>{
  for(const save of [async()=>false,async()=>{throw new Error('Disk full');}]){let left=false;expect(await new LeaveGuard().run({dirty:()=>true,choose:async()=>'save',save,leave:async()=>{left=true;}})).toBe(false);expect(left).toBe(false);}
});
it('does not discard new edits made while an earlier snapshot saves',async()=>{
  let left=false;expect(await new LeaveGuard().run({dirty:()=>true,choose:async()=>'save',save:async()=>true,leave:async()=>{left=true;}})).toBe(false);expect(left).toBe(false);
});
it('serializes leave prompts and rejects the second request',async()=>{
  const guard=new LeaveGuard();let finish!:()=>void;const pending=guard.run({dirty:()=>false,choose:async()=>'cancel',save:async()=>false,leave:()=>new Promise<void>(r=>{finish=r;})});
  expect(await guard.run({dirty:()=>false,choose:async()=>'cancel',save:async()=>false,leave:async()=>{throw new Error('Must not run');}})).toBe(false);finish();expect(await pending).toBe(true);
});
