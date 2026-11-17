import { expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { verifiedDownload } from '../../apps/api/src/files/verified-download.js';
const hash = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
async function* chunks(bytes: Uint8Array) { for (let i = 0; i < bytes.length; i += 4096) yield bytes.subarray(i, i + 4096); }
it('verifies a bounded stream and serves only the immutable snapshot, including ranges', async () => {
  const root = await mkdtemp(join(tmpdir(), 'download-test-'));
  try {
    const bytes = Buffer.alloc(1024 * 1024, 42);
    const file = await verifiedDownload(chunks(bytes), bytes.length, hash(bytes), undefined, root);
    bytes.fill(0);
    const parts: Buffer[] = []; for await (const part of file.stream({ start: 123, end: 222 })) parts.push(Buffer.from(part));
    expect(Buffer.concat(parts)).toEqual(Buffer.alloc(100, 42));
    await file.dispose(); await file.dispose(); expect(await readdir(root)).toEqual([]);
  } finally { await rm(root, { recursive: true, force: true }); }
});
it.each(['short', 'long', 'hash', 'source', 'abort'] as const)('rejects %s content and cleans its private temporary', async kind => {
  const root = await mkdtemp(join(tmpdir(), 'download-failure-')), bytes = Buffer.from('verified');
  const abort = new AbortController();
  async function* source() {
    yield bytes;
    if (kind === 'source') throw new Error('Storage unavailable');
    if (kind === 'abort') abort.abort();
  }
  try {
    await expect(verifiedDownload(source(), bytes.length + (kind === 'short' ? 1 : kind === 'long' ? -1 : 0),
      kind === 'hash' ? '0'.repeat(64) : hash(bytes), abort.signal, root)).rejects.toThrow();
    expect(await readdir(root)).toEqual([]);
  } finally { await rm(root, { recursive: true, force: true }); }
});
it('releases the snapshot after a consumer interrupts a started transfer',async()=>{
  const root=await mkdtemp(join(tmpdir(),'download-interrupted-'));
  try {
    const bytes=Buffer.alloc(1024*1024,17);
    const file=await verifiedDownload(chunks(bytes),bytes.length,hash(bytes),undefined,root);
    for await(const part of file.stream()){expect(part.length).toBeLessThan(bytes.length);break;}
    await file.dispose();expect(await readdir(root)).toEqual([]);
  }finally{await rm(root,{recursive:true,force:true});}
});
