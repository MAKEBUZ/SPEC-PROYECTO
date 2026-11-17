import {it,expect} from 'vitest';
import {mkdtemp,rm,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir,cpus,totalmem,platform,release,arch} from 'node:os';
import {join,resolve} from 'node:path';
import {RecoveryStore} from '../../apps/desktop/src/main/documents/recovery.js';
import {performanceDocument} from '../support/performance-corpus.js';

it.each([{name:'small',pieces:10,segments:20},{name:'medium',pieces:50,segments:100},{name:'large',pieces:100,segments:500}])('persists and recovers the $name corpus ten times within the recovery target',async load=>{
 const directory=await mkdtemp(join(tmpdir(),'patron-recovery-performance-'));
 const document=performanceDocument(load.pieces,load.segments),store=new RecoveryStore(directory),runs=[];
 try{
  for(let i=0;i<10;i++){
   const started=performance.now(),id=await store.capture(document),persisted=performance.now();
   const restored=await new RecoveryStore(directory).restore(id,true),recovered=performance.now();
   expect(restored).toEqual(document);
   runs.push({run:i+1,captureMs:persisted-started,reopenMs:recovered-persisted,totalMs:recovered-started,rssAfter:process.memoryUsage().rss});
  }
  await mkdir('.local/validation',{recursive:true});
  await writeFile(resolve('.local/validation',`recovery-${load.name}.json`),JSON.stringify({load,segmentsPerPiece:true,bytes:Buffer.byteLength(JSON.stringify(document)),node:process.version,os:{platform:platform(),release:release(),arch:arch(),logicalCpus:cpus().length,model:cpus()[0]?.model,totalmem:totalmem()},runs},null,2));
  for(const run of runs)expect(run.totalMs).toBeLessThanOrEqual(60000);
 }finally{await rm(directory,{recursive:true,force:true});}
},180000);
