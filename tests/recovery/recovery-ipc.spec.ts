import { it,expect } from 'vitest';
import { mkdtemp,rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { RecoveryStore } from '../../apps/desktop/src/main/documents/recovery.js';
import { recoveryHandlers } from '../../apps/desktop/src/main/documents/recovery-handlers.js';
import { CapabilityRegistry } from '../../apps/desktop/src/main/ipc-boundary.js';
import { IpcRouter } from '../../apps/desktop/src/main/ipc-router.js';
const doc={formatVersion:1 as const,documentId:randomUUID(),revisionId:'0'.repeat(64),units:'mm' as const,pieces:[],preparations:[]};
it('exposes opaque recovery capabilities, gates access and restores only as unsaved',async()=>{
  const root=await mkdtemp(join(tmpdir(),'patron-recovery-ipc-'));
  try{
    const store=new RecoveryStore(root),file=await store.capture(doc),registry=new CapabilityRegistry();let enabled=false;
    const router=new IpcRouter(registry,recoveryHandlers(store,registry,7),()=>enabled);
    const request=(method:string,fields:Record<string,unknown>={},owner=7)=>router.dispatch({requestId:randomUUID(),method,...fields},owner,'app','app',true);
    expect(await request('recovery.inspect')).toMatchObject({status:'error',error:{code:'SESSION_REQUIRED'}});
    enabled=true;const inspected=await request('recovery.inspect');
    if(inspected.status!=='success')throw Error();
    const data=inspected.data as {candidates:{recoveryId:string}[]};const recoveryId=data.candidates[0]!.recoveryId;
    expect(JSON.stringify(data)).not.toContain(file);expect(JSON.stringify(data)).not.toContain('snapshot');
    expect(await request('recovery.restore',{recoveryId,confirmed:true},8)).toMatchObject({status:'error',error:{code:'ACCESS_DENIED'}});
    expect(await request('recovery.restore',{recoveryId,confirmed:false})).toMatchObject({status:'error'});
    expect(await request('recovery.restore',{recoveryId,confirmed:true})).toMatchObject({status:'success',data:{snapshot:doc,saved:false}});
    const next=await store.capture(doc);
    expect(await request('recovery.discard',{recoveryId,confirmed:true})).toMatchObject({status:'error',error:{code:'RECOVERY_INVALID'}});
    expect((await store.inspect()).candidates[0]!.id).toBe(next);
    const fresh=await request('recovery.inspect');if(fresh.status!=='success')throw Error();
    const current=(fresh.data as {candidates:{recoveryId:string}[]}).candidates[0]!.recoveryId;
    expect(await request('recovery.discard',{recoveryId:current,confirmed:true})).toMatchObject({status:'success',data:{discarded:true}});
    expect(await request('recovery.restore',{recoveryId:current,confirmed:true})).toMatchObject({status:'error'});
    router.release(7);
    expect(await request('recovery.restore',{recoveryId:current,confirmed:true})).toMatchObject({status:'error',error:{code:'ACCESS_DENIED'}});
  }finally{await rm(root,{recursive:true,force:true});}
});
