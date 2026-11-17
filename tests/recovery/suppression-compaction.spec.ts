import {it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {mkdtemp,rm,readdir,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {LocalSuppressionLog,suppressionPlan} from '../../apps/api/src/storage/suppression-log.js';
it('T087 removes only settled unneeded scopes, preserves anchors and unresolved evidence across reopening',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'suppression-compact-'));try{
  const log=new LocalSuppressionLog(dir),id=randomUUID(),resource=randomUUID();
  await log.append({kind:'intent',id,scope:{kind:'pattern',resourceIds:[resource],objectKeys:[]}});
  const terminal=await log.append({kind:'confirmed',id:randomUUID(),intentId:id});
  await log.append({kind:'intent',id:randomUUID(),scope:{kind:'pattern',resourceIds:[randomUUID()],objectKeys:[]}});
  const copy={id:randomUUID(),kind:'restore' as const,capturedAt:0,watermark:{sequence:0,hash:null},state:'deleting' as const};
  expect(await log.compact([copy],new Set([id]))).toBe(0);
  expect(await log.compact([{...copy,state:'deleted'}],new Set())).toBe(0);
  expect(await log.compact([{...copy,state:'deleted'}],new Set([id]))).toBe(2);
  const reopened=new LocalSuppressionLog(dir),records=await reopened.read();expect(records[1]!.hash).toBe(terminal.hash);expect(records[2]!.event.kind).toBe('intent');
  expect(()=>suppressionPlan(records,{sequence:2,hash:terminal.hash})).toThrow('RESTORE_REQUIRES_RECONCILIATION');
  expect(()=>suppressionPlan(records,{sequence:0,hash:null})).toThrow('SUPPRESSION_WATERMARK_RETIRED');
  for(const file of await readdir(dir))expect(await readFile(join(dir,file),'utf8')).not.toContain(resource);
  const next=await reopened.append({kind:'intent',id:randomUUID(),scope:{kind:'account',resourceIds:[randomUUID()],objectKeys:[]}});expect(next.sequence).toBe(4);
  await writeFile(join(dir,'compaction.json'),'broken');await expect(reopened.read()).rejects.toThrow('SUPPRESSION_LOG_DAMAGED');
 }finally{await rm(dir,{recursive:true,force:true});}
});
it('T087 a positively cancelled admission never suppresses data and is compactable without a job',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'suppression-cancel-'));try{
  const log=new LocalSuppressionLog(dir),id=randomUUID();await log.append({kind:'intent',id,scope:{kind:'pattern',resourceIds:[randomUUID()],objectKeys:[]}});
  await log.append({kind:'cancelled',id:randomUUID(),intentId:id});expect(suppressionPlan(await log.read(),{sequence:0,hash:null})).toEqual([]);
  await expect(log.append({kind:'confirmed',id:randomUUID(),intentId:id})).rejects.toThrow('SUPPRESSION_ALREADY_CONFIRMED');
  expect(await log.compact([],new Set())).toBe(2);expect((await log.read()).every(r=>r.event.kind==='retired')).toBe(true);
 }finally{await rm(dir,{recursive:true,force:true});}
});
it('T087 a committed compaction resumes old-file cleanup without restoring removed identities',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'suppression-resume-'));try{
  const log=new LocalSuppressionLog(dir),id=randomUUID(),resource=randomUUID();await log.append({kind:'intent',id,scope:{kind:'pattern',resourceIds:[resource],objectKeys:[]}});
  const stale=await readFile(join(dir,'000000000001.json'),'utf8');await log.append({kind:'confirmed',id:randomUUID(),intentId:id});await log.compact([],new Set([id]));
  await writeFile(join(dir,'000000000001.json'),stale);const reopened=new LocalSuppressionLog(dir);expect((await reopened.read())[0]!.event.kind).toBe('retired');
  expect(await reopened.compact([],new Set())).toBe(0);expect(await readdir(dir)).toEqual(['compaction.json']);
  await writeFile(join(dir,'compaction.pending'),'partial');await expect(reopened.read()).rejects.toThrow('SUPPRESSION_LOG_DAMAGED');
 }finally{await rm(dir,{recursive:true,force:true});}
});
