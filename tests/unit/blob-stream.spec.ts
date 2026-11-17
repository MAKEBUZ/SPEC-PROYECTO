import { it,expect } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtemp,readdir,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalBlobStore } from '../../apps/api/src/storage/blob-store.js';
const sha=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
async function* chunks(b:Uint8Array){for(let i=0;i<b.length;i+=4096)yield b.subarray(i,i+4096);}
it('streams, verifies and retries the same immutable object without leaving temporary files',async()=>{
  const root=await mkdtemp(join(tmpdir(),'patron-stream-'));
  try{
    const store=new LocalBlobStore(root),bytes=Buffer.alloc(1024*1024,7),key='a'.repeat(64),expected={bytes:bytes.length,sha256:sha(bytes)};
    expect(await store.putStream(key,chunks(bytes),expected)).toEqual(expected);
    expect(await store.putStream(key,chunks(bytes),expected)).toEqual(expected);
    expect(await store.get(key)).toEqual(bytes);expect(await readdir(root)).toEqual([key]);
    const altered=Buffer.from('different');await expect(store.putStream(key,chunks(altered),{bytes:altered.length,sha256:sha(altered)})).rejects.toThrow();
    expect(await store.get(key)).toEqual(bytes);expect(await readdir(root)).toEqual([key]);
  }finally{await rm(root,{recursive:true,force:true});}
});
it.each(['short','long','hash','source'] as const)('does not publish or leak temporaries after %s failure',async fault=>{
  const root=await mkdtemp(join(tmpdir(),'patron-stream-failure-'));
  try{
    const store=new LocalBlobStore(root),bytes=Buffer.from('content');
    async function* source(){yield bytes;if(fault==='source')throw Error('Disconnected');}
    await expect(store.putStream('b'.repeat(64),source(),{bytes:bytes.length+(fault==='short'?1:fault==='long'?-1:0),sha256:fault==='hash'?'0'.repeat(64):sha(bytes)})).rejects.toThrow();
    expect(await readdir(root)).toEqual([]);
  }finally{await rm(root,{recursive:true,force:true});}
});
it('accepts a real stream of exactly 100000000 bytes using reusable small chunks',async()=>{
  const root=await mkdtemp(join(tmpdir(),'patron-stream-limit-'));
  try{
    const store=new LocalBlobStore(root),chunk=Buffer.alloc(100000,42),digest=createHash('sha256');
    for(let i=0;i<1000;i++)digest.update(chunk);
    const expected={bytes:100000000,sha256:digest.digest('hex')};
    async function* source(){for(let i=0;i<1000;i++)yield chunk;}
    expect(await store.putStream('c'.repeat(64),source(),expected)).toEqual(expected);
    await expect(store.putStream('d'.repeat(64),source(),{...expected,bytes:100000001})).rejects.toThrow('STORAGE_INPUT_INVALID');
    expect(await readdir(root)).toEqual(['c'.repeat(64)]);
  }finally{await rm(root,{recursive:true,force:true});}
},20000);
