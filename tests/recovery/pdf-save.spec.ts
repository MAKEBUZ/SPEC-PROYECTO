import {it,expect} from 'vitest';
import {mkdtemp,writeFile,readFile,rename,rm,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {saveVerifiedPdf} from '../../apps/desktop/src/main/print/save-pdf.js';
import {identity,type ReplacementAdapter} from '../../apps/desktop/src/main/documents/save.js';
it('preserves the destination on cancellation and replacement failure, removing temporary bytes',async()=>{
 const root=await mkdtemp(join(tmpdir(),'patron-pdf-save-')),path=join(root,'final.pdf');
 const adapter:ReplacementAdapter={assertSupported:async()=>{},flush:async()=>{},create:async(p,t)=>rename(t,p),replace:async()=>{throw Error('disk unavailable');}};
 try{
  await writeFile(path,'previous');const expected=await identity(path);
  expect(await saveVerifiedPdf(path,Buffer.from('verified'),expected,adapter,()=>true)).toBe(false);
  await expect(saveVerifiedPdf(path,Buffer.from('verified'),expected,adapter,()=>false)).rejects.toThrow('disk unavailable');
  expect(await readFile(path,'utf8')).toBe('previous');expect(await readdir(root)).toEqual(['final.pdf']);
  await expect(saveVerifiedPdf(path,Buffer.from('verified'),null,adapter,()=>false)).rejects.toThrow('EXTERNAL_FILE_CHANGED');
  const target=join(root,'new.pdf');expect(await saveVerifiedPdf(target,Buffer.from('verified'),null,adapter,()=>false)).toBe(true);expect(await readFile(target,'utf8')).toBe('verified');
 }finally{if(!resolve(root).startsWith(resolve(tmpdir())+sep))throw Error('Invalid test directory');await rm(root,{recursive:true,force:true});}
});
