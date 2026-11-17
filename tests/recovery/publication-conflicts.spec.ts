import { expect,it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdtemp,readFile,rm,writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConflictResolver, independentPattern, remoteConflictPolicy } from '../../apps/desktop/src/main/publication/conflicts.js';
import { canonicalize,revisionId } from '../../packages/document/src/revision.js';
import type { PatternDocument } from '../../packages/document/src/schema.js';
import { sha256 } from '../../apps/desktop/src/main/documents/save.js';
const doc=():PatternDocument=>({formatVersion:1,documentId:randomUUID(),revisionId:'0'.repeat(64),units:'mm',pieces:[],preparations:[],remoteBinding:{accountId:randomUUID(),patternId:randomUUID(),lastPublishedVersion:randomUUID()}});
it('creates an independent unsaved identity without altering geometry, preparation or original binding',()=>{
  const original=doc(),before=structuredClone(original),next=independentPattern(original);
  expect(next.documentId).not.toBe(original.documentId);expect(next.remoteBinding).toBeUndefined();
  expect(next.pieces).toEqual(original.pieces);expect(next.preparations).toEqual(original.preparations);
  expect(next.revisionId).toBe(revisionId(next));expect(original).toEqual(before);
});
it('never interprets missing authorization or network failure as deletion',()=>{
  expect(remoteConflictPolicy({kind:'unknown'})).toEqual(['keep-local']);
  expect(remoteConflictPolicy({kind:'trashed'})).toEqual(['keep-local','restore-remote']);
  expect(remoteConflictPolicy({kind:'version-conflict'})).toEqual(['keep-local','independent','load-remote']);
  expect(remoteConflictPolicy({kind:'deleted-confirmed'})).toEqual(['keep-local','publish-new']);
});
async function fixture(run:(f:{directory:string;current:()=>PatternDocument;change:()=>void;resolver:ConflictResolver;remote:PatternDocument;bytes:Buffer;version:{accountId:string;patternId:string;versionId:string;documentId:string;revisionId:string;sha256:string;bytes:number}})=>Promise<void>){
  const directory=await mkdtemp(join(tmpdir(),'patron-conflict-'));let current=doc();
  const remote=structuredClone(current);remote.revisionId=revisionId(remote);const bytes=Buffer.from(JSON.stringify(remote));
  const version={accountId:current.remoteBinding!.accountId,patternId:current.remoteBinding!.patternId,versionId:randomUUID(),documentId:remote.documentId,revisionId:remote.revisionId,sha256:sha256(bytes),bytes:bytes.length};
  const resolver=new ConflictResolver(directory,{snapshot:()=>structuredClone(current),replace:(expected,next)=>{if(canonicalize(current)!==expected)return false;current=next;return true;}});
  try{await run({directory,current:()=>current,change:()=>{current={...current,documentId:randomUUID()};},resolver,remote,bytes,version});}
  finally{await rm(directory,{recursive:true,force:true});}
}
it('loads only after a verified independent backup and replaces binding from authorized metadata',async()=>fixture(async f=>{
  const original=f.current(),result=await f.resolver.loadRemote(f.version,async()=>f.bytes,true);
  const backup=JSON.parse(await readFile(result.backupPath,'utf8')) as PatternDocument;
  expect(backup.documentId).toBe(original.documentId);expect(backup.remoteBinding).toEqual(original.remoteBinding);
  expect(backup.revisionId).toBe(revisionId(backup));
  expect(f.current().remoteBinding?.lastPublishedVersion).toBe(f.version.versionId);
}));
it('cancel or failed backup never replaces current work',async()=>fixture(async f=>{
  const before=structuredClone(f.current());
  await expect(f.resolver.loadRemote(f.version,async()=>f.bytes,false)).rejects.toThrow('CONFIRMATION_REQUIRED');
  await writeFile(join(f.directory,'not-directory'),'occupied');
  const broken=new ConflictResolver(join(f.directory,'not-directory'),{snapshot:f.current,replace:()=>{throw new Error('Must not replace');}});
  await expect(broken.loadRemote(f.version,async()=>f.bytes,true)).rejects.toThrow();expect(f.current()).toEqual(before);
}));
it('rejects wrong owner, corrupt download and stale local work',async()=>fixture(async f=>{
  const before=structuredClone(f.current());
  await expect(f.resolver.loadRemote({...f.version,accountId:randomUUID()},async()=>f.bytes,true)).rejects.toThrow('REMOTE_BINDING_MISMATCH');
  await expect(f.resolver.loadRemote(f.version,async()=>Buffer.from('bad'),true)).rejects.toThrow('ARTIFACT_MISMATCH');expect(f.current()).toEqual(before);
  await expect(f.resolver.loadRemote(f.version,async()=>{f.change();return f.bytes;},true)).rejects.toThrow('LOCAL_DOCUMENT_CHANGED');
  expect(f.current().documentId).not.toBe(before.documentId);
}));
it('retains a valid backup if the final atomic replacement detects newer edits',async()=>fixture(async f=>{
  const original=structuredClone(f.current());
  const resolver=new ConflictResolver(f.directory,{snapshot:f.current,replace:()=>false});
  await expect(resolver.loadRemote(f.version,async()=>f.bytes,true)).rejects.toThrow('LOCAL_DOCUMENT_CHANGED');
  expect(f.current()).toEqual(original);
}));
it('does not overlap conflict resolutions or download before confirmation',async()=>fixture(async f=>{
  let calls=0,release!:(bytes:Uint8Array)=>void;
  const download=()=>{calls++;return new Promise<Uint8Array>(resolve=>{release=resolve;});};
  await expect(f.resolver.loadRemote(f.version,download,false)).rejects.toThrow('CONFIRMATION_REQUIRED');expect(calls).toBe(0);
  const first=f.resolver.loadRemote(f.version,download,true);
  await expect(f.resolver.loadRemote(f.version,download,true)).rejects.toThrow('CONFLICT_RESOLUTION_BUSY');expect(calls).toBe(1);
  release(f.bytes);await first;
}));
