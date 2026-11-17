import { it,expect } from 'vitest';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp,rm,readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join,resolve } from 'node:path';
import { DocumentWriter } from '../../apps/desktop/src/main/documents/save.js';
import { SaveJournal } from '../../apps/desktop/src/main/documents/save-journal.js';
import { windowsAdapter } from '../../apps/desktop/src/main/documents/windows-adapter.js';
const doc=()=>({formatVersion:1 as const,documentId:'80000000-0000-4000-8000-000000000001',revisionId:'0'.repeat(64),units:'mm' as const,pieces:[],preparations:[]});
it.each(['before','after','flush'])('recovers after actual child process exit at %s replacement',async stage=>{
 const root=await mkdtemp(join(tmpdir(),'patron-process-crash-'));
 try{
  const path=join(root,'file.patron'),directory=join(root,'journal'),adapter=windowsAdapter(resolve('apps/desktop/native/build/Release/file_replace.node'));
  await new DocumentWriter(directory,adapter).save({path,snapshot:doc(),expected:null});const previous=await readFile(path);
  const child=spawn(process.execPath,[resolve('dist/tests/desktop/save-crash-host.js'),path,directory,stage],{windowsHide:true,stdio:'pipe'});
  let errors='';child.stderr.on('data',b=>{errors+=String(b);});const [code]=await once(child,'exit');expect(code,errors).toBe(73);
  const journal=new SaveJournal(directory,adapter),result=await journal.inspect();expect(result.damaged).toBe(false);expect(result.candidates).toHaveLength(2);
  const candidate=result.candidates.find(c=>c.source==='interrupted-save')!;expect(candidate.snapshot.documentId).toBe('80000000-0000-4000-8000-000000000002');
  expect(candidate.state).toBe(stage==='before'?'unconfirmed':'destination-verified');
  if(stage==='before')expect(await readFile(path)).toEqual(previous);
  expect(result.candidates.find(c=>c.source==='previous-save')!.snapshot.documentId).toBe(doc().documentId);
 }finally{await rm(root,{recursive:true,force:true});}
},15000);
it('preserves the old target when another process denies Windows replacement',async()=>{
 const root=await mkdtemp(join(tmpdir(),'patron-locked-'));
 let child:ReturnType<typeof spawn>|undefined;
 try{
  const path=join(root,'file.patron'),directory=join(root,'journal'),adapter=windowsAdapter(resolve('apps/desktop/native/build/Release/file_replace.node')),writer=new DocumentWriter(directory,adapter);
  const first=await writer.save({path,snapshot:doc(),expected:null}),previous=await readFile(path);
  child=spawn('powershell.exe',['-NoProfile','-NonInteractive','-File',resolve('tests/support/hold-document.ps1'),'-DocumentPath',path],{windowsHide:true,stdio:'pipe'});
  await new Promise<void>((accept,reject)=>{let output='';const timer=setTimeout(()=>reject(Error('Lock timeout')),8000);child!.once('error',e=>{clearTimeout(timer);reject(e);});child!.once('exit',()=>{clearTimeout(timer);reject(Error('Lock helper exited'));});child!.stdout!.on('data',b=>{output+=String(b);if(output.includes('LOCKED')){clearTimeout(timer);accept();}});});
  await expect(writer.save({path,expected:first.identity,snapshot:{...first.snapshot,documentId:'80000000-0000-4000-8000-000000000002'}})).rejects.toThrow('SAVE_UNCONFIRMED');
  expect(await readFile(path)).toEqual(previous);
  expect((await new SaveJournal(directory,adapter).inspect()).candidates).toHaveLength(2);
 }finally{if(child&&child.exitCode===null){const exited=once(child,'exit');child.stdin?.end('\n');await exited;}await rm(root,{recursive:true,force:true});}
},15000);
