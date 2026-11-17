import { createHash,randomUUID } from 'node:crypto';
import { mkdir, readFile, open, unlink,link } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createReadStream } from 'node:fs';

export interface BlobStore {
  put(key: string, bytes: Uint8Array): Promise<{ bytes: number; sha256: string }>;
  putStream(key:string,source:AsyncIterable<Uint8Array>,expected:{bytes:number;sha256:string}):Promise<{bytes:number;sha256:string}>;
  get(key: string): Promise<Uint8Array>;
  open(key: string, signal?: AbortSignal): AsyncIterable<Uint8Array>;
  remove(key:string):Promise<void>;
}

// Local test transport only. Opaque keys cannot choose paths; no AWS client.
export class LocalBlobStore implements BlobStore {
  constructor(private readonly root: string) {}
  private path(key: string): string {
    if (!/^[a-f0-9]{64}$/.test(key)) throw new Error('Clave privada inválida.');
    return resolve(this.root, key);
  }
  async put(key: string, bytes: Uint8Array) {
    return this.putStream(key,(async function*(){yield bytes;})(),{bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
  }
  async putStream(key:string,source:AsyncIterable<Uint8Array>,expected:{bytes:number;sha256:string}) {
    expected={...expected};
    if(!Number.isSafeInteger(expected.bytes)||expected.bytes<0||expected.bytes>100000000||!/^[a-f0-9]{64}$/.test(expected.sha256))throw Error('STORAGE_INPUT_INVALID');
    const path = this.path(key);
    await mkdir(this.root, { recursive: true });
    const temporary=resolve(this.root,`.${randomUUID()}.tmp`);
    const verify=async(file:string)=>{let count=0;const digest=createHash('sha256');for await(const chunk of createReadStream(file)){count+=chunk.length;if(count>expected.bytes)throw Error('STORAGE_CONTENT_MISMATCH');digest.update(chunk);}if(count!==expected.bytes||digest.digest('hex')!==expected.sha256)throw Error('STORAGE_CONTENT_MISMATCH');};
    const handle=await open(temporary,'wx',0o600);
    try{
      try{
        let count=0;const digest=createHash('sha256');
        for await(const chunk of source){count+=chunk.byteLength;if(count>expected.bytes)throw Error('STORAGE_CONTENT_MISMATCH');digest.update(chunk);
          for(let offset=0;offset<chunk.byteLength;){const {bytesWritten}=await handle.write(chunk,offset,chunk.byteLength-offset);if(!bytesWritten)throw Error('STORAGE_WRITE_FAILED');offset+=bytesWritten;}
        }
        if(count!==expected.bytes||digest.digest('hex')!==expected.sha256)throw Error('STORAGE_CONTENT_MISMATCH');await handle.sync();
      }finally{await handle.close();}
      await verify(temporary);
      try{await link(temporary,path);}catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;}
      await verify(path);return {...expected};
    }finally{await unlink(temporary);}
  }
  async get(key: string): Promise<Uint8Array> { return readFile(this.path(key)); }
  async *open(key: string, signal?: AbortSignal): AsyncIterable<Uint8Array> {
    yield* createReadStream(this.path(key), { highWaterMark: 65536, ...(signal ? { signal } : {}) });
  }
  async remove(key:string):Promise<void>{try{await unlink(this.path(key));}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}}
}
