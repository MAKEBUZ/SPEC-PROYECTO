import { it,expect,beforeEach,afterEach } from 'vitest';
import { mkdtemp,readFile,rename,copyFile,writeFile,readdir,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join,resolve } from 'node:path';
import { windowsAdapter } from '../../apps/desktop/src/main/documents/windows-adapter.js';
import { DocumentWriter,identity } from '../../apps/desktop/src/main/documents/save.js';
import type { ReplacementAdapter } from '../../apps/desktop/src/main/documents/save.js';
import { openDocument } from '../../apps/desktop/src/main/documents/open.js';
import type { PatternDocument } from '../../packages/document/src/schema.js';
let dir:string,path:string,journal:string,adapter:ReplacementAdapter;
const doc=():PatternDocument=>({formatVersion:1,documentId:'80000000-0000-4000-8000-000000000001',revisionId:'0'.repeat(64),units:'mm',pieces:[],preparations:[]});
beforeEach(async()=>{dir=await mkdtemp(join(tmpdir(),'patron-save-'));path=join(dir,'pattern.patron');journal=join(dir,'journal');adapter={assertSupported:async()=>{},replace:async(dest,temp,backup)=>{await copyFile(dest,backup);await copyFile(temp,dest);},create:async(dest,temp)=>{await copyFile(temp,dest,1);},flush:async()=>{}};});
beforeEach(()=>{if(process.env.PATRON_NATIVE_TEST==='1')adapter=windowsAdapter(resolve('apps/desktop/native/build/Release/file_replace.node'));});
afterEach(async()=>{await rm(dir,{recursive:true,force:true});});
it('writes a verified revision, opens it and keeps an independent previous copy',async()=>{
  const writer=new DocumentWriter(journal,adapter),first=await writer.save({path,snapshot:doc(),expected:null});
  expect((await openDocument(path,adapter)).snapshot).toEqual(first.snapshot);
  await writer.save({path,snapshot:first.snapshot,expected:first.identity});
  const backup=(await readdir(journal)).find(p=>p.endsWith('.previous.patron'))!;expect(JSON.parse(await readFile(join(journal,backup),'utf8'))).toEqual(first.snapshot);
});
it('blocks changed files including SaveAs to the same conflicted original',async()=>{
  const writer=new DocumentWriter(journal,adapter),first=await writer.save({path,snapshot:doc(),expected:null});await writeFile(path,'external');
  await expect(writer.save({path,snapshot:doc(),expected:first.identity})).rejects.toThrow('EXTERNAL_FILE_CHANGED');
  await expect(writer.save({path,snapshot:doc(),expected:await identity(path),blockedPath:path})).rejects.toThrow('EXTERNAL_FILE_CHANGED');expect(await readFile(path,'utf8')).toBe('external');
});
it.each(['before','after'])('reconciles a replacement failure %s changing names',async stage=>{
  const writer=new DocumentWriter(journal,adapter),first=await writer.save({path,snapshot:doc(),expected:null});const normal=adapter.replace;
  const changed=doc();changed.documentId='80000000-0000-4000-8000-000000000002';
  adapter.replace=async(...args)=>{if(stage==='after')await normal(...args);throw new Error('Injected interruption');};
  const result=writer.save({path,snapshot:changed,expected:first.identity});if(stage==='after')expect((await result).snapshot.documentId).toBe(changed.documentId);else{await expect(result).rejects.toThrow('SAVE_UNCONFIRMED');expect((await openDocument(path,adapter)).snapshot).toEqual(first.snapshot);}
});
it('does not acknowledge a failed flush and retains recovery candidates',async()=>{
  adapter.flush=async()=>{throw new Error('USB removed');};await expect(new DocumentWriter(journal,adapter).save({path,snapshot:doc(),expected:null})).rejects.toThrow('USB removed');expect((await readdir(journal)).some(p=>p.endsWith('.intent.json'))).toBe(true);
});
it('rejects malformed or future documents without changing caller memory or bytes',async()=>{
  const before=doc();for(const source of ['{broken',JSON.stringify({...before,formatVersion:2})]){await writeFile(path,source);await expect(openDocument(path,adapter)).rejects.toThrow();expect(await readFile(path,'utf8')).toBe(source);}expect(before).toEqual(doc());
});
it('serializes writers and rejects the second stale identity',async()=>{
  const writer=new DocumentWriter(journal,adapter);const [a,b]=await Promise.allSettled([writer.save({path,snapshot:doc(),expected:null}),writer.save({path,snapshot:doc(),expected:null})]);expect(a.status).toBe('fulfilled');expect(b.status).toBe('rejected');
});

