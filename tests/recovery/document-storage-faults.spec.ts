import { it,expect,vi,afterEach } from 'vitest';
const fault=vi.hoisted(()=>({suffix:'',method:'writeFile',code:'ENOSPC',hit:false}));
vi.mock('node:fs/promises',async importOriginal=>{
 const fs=await importOriginal<typeof import('node:fs/promises')>();
 return {...fs,open:async(...args:Parameters<typeof fs.open>)=>{
  const path=String(args[0]),match=!!fault.suffix&&path.endsWith(fault.suffix)&&args[1]==='wx';
  const error=()=>Object.assign(Error(`Injected ${fault.code}`),{code:fault.code});
  if(match&&fault.method==='open'){fault.hit=true;throw error();}
  const handle=await fs.open(...args);
  return new Proxy(handle,{get(target,key){const value=Reflect.get(target,key,target);if(typeof value!=='function')return value;
   if(match&&key===fault.method)return async(...params:unknown[])=>{fault.hit=true;if(key==='writeFile')await target.writeFile(Buffer.from(params[0] as Uint8Array).subarray(0,8));throw error();};
   return value.bind(target);
  }});
 }};
});
import { mkdtemp,rm,readFile,readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join,resolve } from 'node:path';
import { DocumentWriter } from '../../apps/desktop/src/main/documents/save.js';
import { windowsAdapter } from '../../apps/desktop/src/main/documents/windows-adapter.js';
import { SaveJournal } from '../../apps/desktop/src/main/documents/save-journal.js';
const doc=()=>({formatVersion:1 as const,documentId:'80000000-0000-4000-8000-000000000001',revisionId:'0'.repeat(64),units:'mm' as const,pieces:[],preparations:[]});
afterEach(()=>{fault.suffix='';fault.hit=false;});
it.each([
 ['.tmp','writeFile','ENOSPC'],['.next.patron','writeFile','ENOSPC'],['.previous.patron','writeFile','ENOSPC'],['.intent.json','writeFile','ENOSPC'],['.confirmed.json','writeFile','ENOSPC'],
 ['.tmp','sync','EIO'],['.next.patron','sync','EIO'],['.previous.patron','sync','EIO'],['.intent.json','sync','EIO'],['.confirmed.json','sync','EIO'],['.tmp','open','EACCES'],
])('preserves recoverable data when %s %s fails with %s',async(suffix,method,code)=>{
 const root=await mkdtemp(join(tmpdir(),'patron-storage-fault-'));
 try{
  const path=join(root,'file.patron'),directory=join(root,'journal'),adapter=windowsAdapter(resolve('apps/desktop/native/build/Release/file_replace.node')),writer=new DocumentWriter(directory,adapter);
  const first=await writer.save({path,snapshot:doc(),expected:null}),bytes=await readFile(path);
  const snapshot={...first.snapshot,documentId:'80000000-0000-4000-8000-000000000002'},original=structuredClone(snapshot);
  Object.assign(fault,{suffix,method,code,hit:false});
  await expect(writer.save({path,snapshot,expected:first.identity})).rejects.toMatchObject({code});expect(fault.hit).toBe(true);expect(snapshot).toEqual(original);fault.suffix='';
  if(suffix!=='.confirmed.json')expect(await readFile(path)).toEqual(bytes);
  else{
   const backups=(await readdir(directory)).filter(p=>p.endsWith('.previous.patron'));expect(backups).toHaveLength(1);expect(await readFile(join(directory,backups[0]!))).toEqual(bytes);
   expect(JSON.parse(await readFile(path,'utf8')).documentId).toBe(snapshot.documentId);
  }
  const inspection=await new SaveJournal(directory,adapter).inspect();
  if((suffix==='.intent.json'||suffix==='.confirmed.json')&&method==='writeFile')expect(inspection.damaged).toBe(true);
  if(suffix==='.intent.json'&&method==='sync')expect(inspection.candidates.some(c=>c.snapshot.documentId===snapshot.documentId)).toBe(true);
 }finally{fault.suffix='';await rm(root,{recursive:true,force:true});}
});
