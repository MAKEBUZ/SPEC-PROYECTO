import { it,expect,vi,afterEach } from 'vitest';
import { startRecovery } from '../../apps/desktop/src/main/documents/recovery.js';
const doc={formatVersion:1 as const,documentId:'80000000-0000-4000-8000-000000000001',revisionId:'0'.repeat(64),units:'mm' as const,pieces:[],preparations:[]};
afterEach(()=>vi.useRealTimers());
it('captures new documents immediately and at the 60 second target without overlapping writes',async()=>{
  vi.useFakeTimers();let release!:(id:string)=>void;
  const capture=vi.fn(()=>new Promise<string>(r=>{release=r;})),failed=vi.fn();
  const stop=startRecovery({capture},()=>doc,failed);
  expect(capture).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(120000);expect(capture).toHaveBeenCalledTimes(1);
  release('first');await Promise.resolve();
  await vi.advanceTimersByTimeAsync(59999);expect(capture).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);expect(capture).toHaveBeenCalledTimes(2);
  stop();release('second');await vi.advanceTimersByTimeAsync(120000);
  expect(capture).toHaveBeenCalledTimes(2);expect(failed).not.toHaveBeenCalled();
});
it('reports snapshot and storage failures and retries without saving or publishing',async()=>{
  vi.useFakeTimers();const snapshot=vi.fn().mockImplementationOnce(()=>{throw Error('SNAPSHOT_FAILED');}).mockReturnValue(doc);
  const capture=vi.fn().mockRejectedValueOnce(Error('DISK_FULL')).mockResolvedValue('stored'),failed=vi.fn();
  const stop=startRecovery({capture},snapshot,failed);
  expect(failed).toHaveBeenCalledWith(expect.objectContaining({message:'SNAPSHOT_FAILED'}));
  await vi.advanceTimersByTimeAsync(60000);expect(failed).toHaveBeenCalledWith(expect.objectContaining({message:'DISK_FULL'}));
  await vi.advanceTimersByTimeAsync(60000);expect(capture).toHaveBeenCalledTimes(2);
  stop();
});
