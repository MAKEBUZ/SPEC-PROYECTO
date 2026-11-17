import {it,expect} from 'vitest';
import {readFile,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {ExportJob} from '../../apps/desktop/src/main/print/export-job.js';
import {pdfFixture} from '../support/pdf-fixture.js';
it('returns only independently verified immutable snapshot bytes from a separate worker',async()=>{
 const {document,preparation}=pdfFixture(),snapshot=Buffer.from(JSON.stringify(document));
 const job=new ExportJob(snapshot,preparation.id,await readFile('.local/assets/NotoSans-Regular.ttf'),pathToFileURL(resolve('dist/apps/desktop/src/main/print/export-runner.js')));
 snapshot.fill(0);const states:string[]=[];job.subscribe(p=>states.push(p.state));
 const result=await job.finished;expect(result?.measurement.scale).toBe(1);expect(states).toContain('verifying');expect(job.progress.state).toBe('verified');
},30000);
it('shows cancelling immediately and terminates CPU work within the five second objective',async()=>{
 const root=await mkdtemp(join(tmpdir(),'patron-export-cancel-'));
 try{
  const runner=join(root,'busy.cjs');await writeFile(runner,'while (true) {}');
  const job=new ExportJob(new Uint8Array(),'unused',new Uint8Array(),pathToFileURL(runner));
  const started=performance.now(),cancelled=job.cancel();expect(job.progress.state).toBe('cancelling');
  await cancelled;expect(performance.now()-started).toBeLessThan(5000);expect(await job.finished).toBeNull();expect(job.progress.state).toBe('cancelled');
 }finally{if(!resolve(root).startsWith(resolve(tmpdir(),'patron-export-cancel-')))throw Error('Unsafe cleanup');await rm(root,{recursive:true,force:true});}
});
