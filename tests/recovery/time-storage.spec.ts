import { expect,it } from 'vitest';
import { mkdtemp,readdir,readFile,writeFile,rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { TimeCheckStorage } from '../../apps/desktop/src/main/operations/time-storage.js';
import { beginTimeQuery,newTimeCheck,resumeTimeCheck } from '../../packages/document/src/operations/time-check.js';
it('persists interrupted queries once and retains the recovered wait across reopenings',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'patron-time-'));
  try{
    const storage=new TimeCheckStorage(directory),query=beginTimeQuery(newTimeCheck(),{now:1,continuity:'boot'},{id:'query',nonce:'nonce',open:true,online:true});
    await storage.save(query);
    const restarted=new TimeCheckStorage(directory),interrupted=resumeTimeCheck(await restarted.load(),{now:100,continuity:'boot'});
    await restarted.save(interrupted);
    const reopened=await new TimeCheckStorage(directory).load();
    expect(reopened.failures).toBe(1);expect(reopened.wait?.started).toBe(100);
    expect(resumeTimeCheck(reopened,{now:200,continuity:'boot'})).toEqual(reopened);
  }finally{await rm(directory,{recursive:true,force:true});}
});
it('isolates corruption instead of falling back to an older querying state',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'patron-time-damage-'));
  try{
    const storage=new TimeCheckStorage(directory);await storage.save(newTimeCheck());await storage.save(newTimeCheck());
    const latest=(await readdir(directory)).sort().at(-1)!;await writeFile(join(directory,latest),'{broken');
    await expect(new TimeCheckStorage(directory).load()).rejects.toThrow('TIME_CHECK_DAMAGED');
    await expect(storage.save(newTimeCheck())).rejects.toThrow('TIME_CHECK_DAMAGED');
  }finally{await rm(directory,{recursive:true,force:true});}
});
it('rejects missing generations and never persists an unconfirmed in-memory result',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'patron-time-gap-'));
  try{
    const storage=new TimeCheckStorage(directory);
    await expect(storage.save({...newTimeCheck(),phase:'save_pending'})).rejects.toThrow('TIME_CHECK_DAMAGED');
    await storage.save(newTimeCheck());await storage.save(newTimeCheck());
    const files=(await readdir(directory)).sort();await rm(join(directory,files[0]!));
    await expect(storage.load()).rejects.toThrow('TIME_CHECK_DAMAGED');
    expect(await readFile(join(directory,files[1]!), 'utf8')).toContain('checksum');
  }finally{await rm(directory,{recursive:true,force:true});}
});
