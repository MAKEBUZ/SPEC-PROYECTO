import { it,expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdtemp,rm,writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { LocalSuppressionLog,suppressionPlan,type SuppressionEvent } from '../../apps/api/src/storage/suppression-log.js';
const intent=():SuppressionEvent=>({id:randomUUID(),kind:'intent',scope:{kind:'pattern',resourceIds:[randomUUID()],objectKeys:['a'.repeat(64)]}});
it('persists immutable intentions, confirms idempotently and includes confirmations after backup watermark',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'suppression-'));
  try{
    const log=new LocalSuppressionLog(directory),e=intent(),first=await log.append(e);
    expect(await log.append(e)).toEqual(first);
    const incomplete=await log.read();expect(()=>suppressionPlan(incomplete,{sequence:1,hash:first.hash})).toThrow('RESTORE_REQUIRES_RECONCILIATION');
    const confirm={id:randomUUID(),kind:'confirmed' as const,intentId:e.id};await log.append(confirm);await log.append(confirm);
    const records=await new LocalSuppressionLog(directory).read();expect(records).toHaveLength(2);
    expect(suppressionPlan(records,{sequence:1,hash:first.hash})).toEqual(e.kind==='intent'?[e.scope]:[]);
    expect(suppressionPlan(records,{sequence:2,hash:records[1]!.hash})).toEqual([]);
    expect(()=>suppressionPlan(records,{sequence:1,hash:'wrong'})).toThrow('SUPPRESSION_WATERMARK_INVALID');
  }finally{await rm(directory,{recursive:true,force:true});}
});
it('rejects metadata beyond opaque scope, orphan confirmation, changed identity and damaged evidence',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'suppression-damage-'));
  try{
    const log=new LocalSuppressionLog(directory),e=intent();await log.append(e);
    await expect(log.append({id:randomUUID(),kind:'confirmed',intentId:randomUUID()})).rejects.toThrow('SUPPRESSION_INTENT_MISSING');
    await expect(log.append({...intent(),id:e.id})).rejects.toThrow('SUPPRESSION_ID_REUSED');
    expect(()=>log.append({...e,email:'private@example.invalid'} as unknown as SuppressionEvent)).toThrow();
    await writeFile(join(directory,'000000000001.json'),'{broken');
    await expect(log.read()).rejects.toThrow('SUPPRESSION_LOG_DAMAGED');await expect(log.append(intent())).rejects.toThrow('SUPPRESSION_LOG_DAMAGED');
  }finally{await rm(directory,{recursive:true,force:true});}
});
it('rejects modified and truncated evidence before authorizing an isolated restore',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'suppression-restore-'));
  try{
    const log=new LocalSuppressionLog(directory),e=intent();await log.append(e);
    const confirmation=await log.append({id:randomUUID(),kind:'confirmed',intentId:e.id});
    const records=await log.read(),changed=structuredClone(records);
    if(changed[0]!.event.kind!=='intent')throw Error();
    changed[0]!.event.scope.resourceIds=[randomUUID()];
    expect(()=>suppressionPlan(changed,{sequence:0,hash:null})).toThrow('SUPPRESSION_LOG_DAMAGED');
    expect(()=>suppressionPlan(records.slice(0,1),{sequence:2,hash:confirmation.hash})).toThrow('SUPPRESSION_WATERMARK_INVALID');
    expect(()=>suppressionPlan(records.slice(1),{sequence:0,hash:null})).toThrow('SUPPRESSION_LOG_DAMAGED');
    expect(suppressionPlan(records,{sequence:0,hash:null})).toHaveLength(1);
  }finally{await rm(directory,{recursive:true,force:true});}
});
it('serializes concurrent appends and never exposes caller mutations as stored evidence',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'suppression-concurrent-'));
  try{
    const log=new LocalSuppressionLog(directory),e=intent(),original=structuredClone(e);
    const first=log.append(e);
    if(e.kind==='intent')e.scope.resourceIds[0]=randomUUID();
    const second=log.append(intent());await Promise.all([first,second]);
    const records=await log.read();expect(records.map(r=>r.sequence)).toEqual([1,2]);
    expect(records[0]!.event).toEqual(original);expect(records[1]!.previous).toBe(records[0]!.hash);
    expect(()=>suppressionPlan(records,{sequence:0,hash:null})).toThrow('RESTORE_REQUIRES_RECONCILIATION');
  }finally{await rm(directory,{recursive:true,force:true});}
});
