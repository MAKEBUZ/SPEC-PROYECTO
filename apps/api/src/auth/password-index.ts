import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, appendFileSync } from 'node:fs';
import { mkdir, mkdtemp, open, readFile, rename, rm, stat, unlink, writeFile } from 'node:fs/promises';
import type { FileHandle } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';

export interface SourceApproval { sha256: string; bytes: number; entries: number; revision: string; license: string }
export interface IndexApproval { version: 1; sha256: string; bytes: number; entries: number; source: SourceApproval }
export interface CorpusLookup { has(password: string): Promise<boolean> }
const WIDTH = 32;
const hash = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest();
const unavailable = () => new Error('El índice de contraseñas no está disponible o no es íntegro.');
const verifiedStamps = new WeakMap<FileHandle, string>();

/** Offline builder: 256 disk partitions, 8 MiB of input buffers. Never retains
 * millions of plaintext entries or hashes as JS objects in one array. */
export async function buildPasswordIndex(options: { source: string; outputDirectory: string; sourceApproval: SourceApproval; indexApproval?: IndexApproval; licenseText?: string }): Promise<IndexApproval> {
  const { source, sourceApproval } = options;
  if (!/^[a-f0-9]{64}$/.test(sourceApproval.sha256) || !Number.isSafeInteger(sourceApproval.entries) || sourceApproval.entries < 1 || (await stat(source)).size !== sourceApproval.bytes) throw unavailable();
  const root = resolve(options.outputDirectory); await mkdir(root, { recursive: true });
  const staging = await mkdtemp(join(root, '.building-'));
  let publishedDirectory = false;
  try {
    const partitions = Array.from({ length: 256 }, () => Buffer.alloc(WIDTH * 1024));
    const filled = new Uint32Array(256);
    const bucketPath = (bucket: number) => join(staging, `${bucket}.part`);
    const flush = (bucket: number) => {
      if (filled[bucket]) appendFileSync(bucketPath(bucket), partitions[bucket]!.subarray(0, filled[bucket]! * WIDTH));
      filled[bucket] = 0;
    };
    let count = 0;
    const accept = (entry: Buffer) => {
      const digest = hash(entry), bucket = digest[0]!;
      digest.copy(partitions[bucket]!, filled[bucket]! * WIDTH); filled[bucket] = filled[bucket]! + 1; count++;
      if (filled[bucket] === 1024) flush(bucket);
    };
    const sourceHash = createHash('sha256'); let carry = Buffer.alloc(0); let bytesRead = 0;
    for await (const chunk of createReadStream(source)) {
      const bytes = chunk as Buffer; sourceHash.update(bytes); bytesRead += bytes.length;
      const buffer = carry.length ? Buffer.concat([carry, bytes]) : bytes;
      let offset = 0, newline: number;
      while ((newline = buffer.indexOf(10, offset)) >= 0) { accept(buffer.subarray(offset, newline)); offset = newline + 1; }
      carry = Buffer.from(buffer.subarray(offset));
    }
    if (carry.length) accept(carry);
    if (sourceHash.digest('hex') !== sourceApproval.sha256 || bytesRead !== sourceApproval.bytes || count !== sourceApproval.entries) throw unavailable();
    for (let bucket = 0; bucket < 256; bucket++) flush(bucket);
    const output = await open(join(staging, 'index.bin'), 'wx');
    const indexHash = createHash('sha256'); let position = 0;
    try {
      for (let bucket = 0; bucket < 256; bucket++) {
        let data: Buffer;
        try { data = await readFile(bucketPath(bucket)); }
        catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue; throw error; }
        if (data.length % WIDTH) throw unavailable();
        const records = Array.from({ length: data.length / WIDTH }, (_, i) => data.subarray(i * WIDTH, (i + 1) * WIDTH));
        records.sort(Buffer.compare);
        const sorted = Buffer.concat(records); indexHash.update(sorted);
        let offset = 0;
        while (offset < sorted.length) {
          const written = await output.write(sorted, offset, sorted.length - offset, position);
          if (!written.bytesWritten) throw unavailable();
          offset += written.bytesWritten; position += written.bytesWritten;
        }
        await unlink(bucketPath(bucket));
      }
      await output.sync();
    } finally { await output.close(); }
    const approval: IndexApproval = { version: 1, sha256: indexHash.digest('hex'), bytes: position, entries: count, source: sourceApproval };
    if (position !== count * WIDTH) throw unavailable();
    if (options.indexApproval && JSON.stringify(options.indexApproval) !== JSON.stringify(approval)) throw unavailable();
    if (options.licenseText) await writeFile(join(staging, 'LICENSE'), options.licenseText, 'utf8');
    const metadata = await open(join(staging, 'metadata.json'), 'wx');
    try { await metadata.writeFile(JSON.stringify(approval)); await metadata.sync(); } finally { await metadata.close(); }
    // Verify the candidate from disk before publishing a pointer. New generations
    // never overwrite bytes used by readers of the previous valid generation.
    const candidate = await openVerified(staging, approval); await candidate.close();
    const generation = `gen-${randomUUID()}`;
    const destination = resolve(root, generation);
    if (!destination.startsWith(root + sep + 'gen-') || !resolve(staging).startsWith(root + sep + '.building-')) throw unavailable();
    await rename(staging, destination); publishedDirectory = true;
    const pointer = join(root, `.pointer-${randomUUID()}.tmp`);
    try {
      const file = await open(pointer, 'wx');
      try { await file.writeFile(JSON.stringify({ generation })); await file.sync(); } finally { await file.close(); }
      await rename(pointer, join(root, 'current.json'));
    } finally { await unlink(pointer).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
    return approval;
  } finally {
    // Only the unique staging child created by this invocation may be removed.
    if (!publishedDirectory) {
      if (!resolve(staging).startsWith(root + sep + '.building-')) throw unavailable();
      await rm(staging, { recursive: true, force: true });
    }
  }
}

async function openVerified(directory: string, approved: IndexApproval): Promise<FileHandle> {
  if (approved.version !== 1 || !/^[a-f0-9]{64}$/.test(approved.sha256) || !Number.isSafeInteger(approved.entries) || approved.entries < 1 || approved.bytes !== approved.entries * WIDTH) throw unavailable();
  const metadata: unknown = JSON.parse(await readFile(join(directory, 'metadata.json'), 'utf8'));
  if (JSON.stringify(metadata) !== JSON.stringify(approved)) throw unavailable();
  const file = await open(join(directory, 'index.bin'), 'r');
  try {
    const originalStamp = await stamp(file);
    const info = await file.stat();
    if (!info.isFile() || info.size !== approved.bytes) throw unavailable();
    const checksum = createHash('sha256');
    let previous: Buffer | undefined, carry = Buffer.alloc(0), count = 0;
    for await (const chunk of file.createReadStream({ autoClose: false, highWaterMark: 65536, start: 0 })) {
      const bytes = chunk as Buffer; checksum.update(bytes);
      const buffer = carry.length ? Buffer.concat([carry, bytes]) : bytes;
      const complete = buffer.length - buffer.length % WIDTH;
      for (let offset = 0; offset < complete; offset += WIDTH) {
        const record = buffer.subarray(offset, offset + WIDTH);
        if (previous && Buffer.compare(previous, record) > 0) throw unavailable();
        previous = record; count++;
      }
      if (previous) previous = Buffer.from(previous);
      carry = Buffer.from(buffer.subarray(complete));
    }
    if (carry.length || count !== approved.entries || checksum.digest('hex') !== approved.sha256 || await stamp(file) !== originalStamp) throw unavailable();
    verifiedStamps.set(file, originalStamp);
    return file;
  } catch { await file.close(); throw unavailable(); }
}

export class PasswordIndex implements CorpusLookup {
  private valid = true;
  private constructor(private readonly file: FileHandle, private readonly entries: number, private readonly fingerprint: string) {}
  static async open(root: string, approved: IndexApproval): Promise<PasswordIndex> {
    try {
      const pointer = JSON.parse(await readFile(join(root, 'current.json'), 'utf8')) as { generation?: unknown };
      if (typeof pointer.generation !== 'string' || !/^gen-[a-f0-9-]{36}$/.test(pointer.generation)) throw unavailable();
      const file = await openVerified(join(root, pointer.generation), approved);
      return new PasswordIndex(file, approved.entries, verifiedStamps.get(file)!);
    } catch { throw unavailable(); }
  }
  async has(password: string): Promise<boolean> {
    if (!this.valid) throw unavailable();
    try {
      if (await stamp(this.file) !== this.fingerprint) throw unavailable();
      const wanted = hash(password), record = Buffer.alloc(WIDTH);
      let low = 0, high = this.entries - 1;
      while (low <= high) {
        const middle = Math.floor((low + high) / 2); let offset = 0;
        while (offset < WIDTH) {
          const read = await this.file.read(record, offset, WIDTH - offset, middle * WIDTH + offset);
          if (!read.bytesRead) throw unavailable(); offset += read.bytesRead;
        }
        const order = Buffer.compare(record, wanted);
        if (order === 0) { if (await stamp(this.file) !== this.fingerprint) throw unavailable(); return true; }
        if (order < 0) low = middle + 1; else high = middle - 1;
      }
      if (await stamp(this.file) !== this.fingerprint) throw unavailable();
      return false;
    } catch { this.valid = false; throw unavailable(); }
  }
  async close(): Promise<void> { this.valid = false; await this.file.close(); }
}
async function stamp(file: FileHandle): Promise<string> {
  const info = await file.stat({ bigint: true });
  return `${info.size}:${info.mtimeNs}:${info.ctimeNs}:${info.ino}`;
}

/** Can be injected before an index is loaded: unavailable corpus blocks new
 * passwords without preventing construction of the login service. */
export class PasswordCorpus implements CorpusLookup {
  private index: PasswordIndex | undefined;
  private tail: Promise<unknown> = Promise.resolve();
  private enqueue<T>(action: () => Promise<T>): Promise<T> {
    const result = this.tail.then(action, action);
    this.tail = result.then(() => undefined, () => undefined);
    return result;
  }
  reload(root: string, approved: IndexApproval): Promise<void> {
    return this.enqueue(async () => {
      // Validate first. Read/validation failure never touches the active handle.
      const next = await PasswordIndex.open(root, approved);
      try { await this.index?.close(); } catch (error) { await next.close(); throw error; }
      this.index = next;
    });
  }
  has(password: string): Promise<boolean> {
    return this.enqueue(async () => {
      if (!this.index) throw unavailable();
      return this.index.has(password);
    });
  }
  close(): Promise<void> {
    return this.enqueue(async () => { const current = this.index; this.index = undefined; await current?.close(); });
  }
}
