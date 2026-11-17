import { createHash } from 'node:crypto';
import { mkdtemp, open, rm } from 'node:fs/promises';
import type { FileHandle } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ValidationError } from '../../../../packages/contracts/src/validation.js';

/** Private verified snapshot: storage may change after validation, so the exact
 * verified bytes are spooled to a private file and served through the same handle.
 * Disk use is bounded by the declared publication size; memory by stream chunks. */
export async function verifiedDownload(source: AsyncIterable<Uint8Array>, size: number, sha256: string,
  signal?: AbortSignal, root = tmpdir()) {
  if (!Number.isSafeInteger(size) || size < 0 || size > 100000000 || !/^[a-f0-9]{64}$/.test(sha256)) {
    throw new ValidationError('ARTIFACT_MISMATCH');
  }
  signal?.throwIfAborted();
  const directory = await mkdtemp(join(root, 'patron-download-'));
  let handle: FileHandle | undefined;
  let disposed = false;
  const dispose = async () => {
    if (disposed) return;
    await handle?.close();
    await rm(directory, { recursive: true, force: true });
    disposed = true;
  };
  try {
    handle = await open(join(directory, 'snapshot'), 'wx+', 0o600);
    const hash = createHash('sha256'); let count = 0;
    for await (const chunk of source) {
      signal?.throwIfAborted(); count += chunk.byteLength;
      if (count > size) throw new ValidationError('ARTIFACT_MISMATCH');
      hash.update(chunk);
      // FileHandle.write may be partial; never assume a whole chunk was written.
      for (let offset = 0; offset < chunk.byteLength;) {
        const { bytesWritten } = await handle.write(chunk, offset, chunk.byteLength - offset);
        if (!bytesWritten) throw new Error('DOWNLOAD_STORAGE_UNAVAILABLE');
        offset += bytesWritten;
      }
    }
    signal?.throwIfAborted();
    if (count !== size || hash.digest('hex') !== sha256) throw new ValidationError('ARTIFACT_MISMATCH');
    // Verify the written copy too, before any headers or body are released.
    const storedHash = createHash('sha256');
    for await (const chunk of handle.createReadStream({ start: 0, autoClose: false })) storedHash.update(chunk);
    if (storedHash.digest('hex') !== sha256) throw new ValidationError('ARTIFACT_MISMATCH');
    signal?.throwIfAborted();
    return { size, dispose, read:async()=>{
      if(disposed)throw new Error('DOWNLOAD_CLOSED');
      const bytes=Buffer.alloc(size);
      for(let offset=0;offset<size;){const result=await handle!.read(bytes,offset,size-offset,offset);if(!result.bytesRead)throw new Error('DOWNLOAD_STORAGE_UNAVAILABLE');offset+=result.bytesRead;}
      return bytes;
    }, stream: (range?: { start: number; end: number }) => {
      if (disposed) throw new Error('DOWNLOAD_CLOSED');
      return handle!.createReadStream({ start: range?.start ?? 0, ...(range ? { end: range.end } : {}), autoClose: false });
    } };
  } catch (error) { await dispose(); throw error; }
}
