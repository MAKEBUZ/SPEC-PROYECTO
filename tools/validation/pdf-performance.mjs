import {readFile,writeFile,mkdir,mkdtemp,rm,readdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {tmpdir,cpus,totalmem,release} from 'node:os';
import {randomUUID,createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {performanceDocument,printBoundaryDocument} from '../../dist/tests/support/performance-corpus.js';
import {revisionId} from '../../dist/packages/document/src/revision.js';
import {ExportJob} from '../../dist/apps/desktop/src/main/print/export-job.js';
import {saveVerifiedPdf} from '../../dist/apps/desktop/src/main/print/save-pdf.js';
import {windowsAdapter} from '../../dist/apps/desktop/src/main/documents/windows-adapter.js';
const name=process.argv[2]??'small',cancelMode=process.argv.includes('--cancel'),loads={small:[10,20],medium:[50,100],large:[100,500],'maximum-format':[4,4],'250-pages':[2,4]},load=loads[name];
if(!load||process.platform!=='win32')throw Error('WINDOWS_CORPUS_REQUIRED');
const boundary=['maximum-format','250-pages'].includes(name)?printBoundaryDocument(name):null;
const document=boundary?.document??performanceDocument(...load),preparation=boundary?.preparation??{id:randomUUID(),name:'Rendimiento',selection:document.pieces.map(p=>p.id),transforms:Object.fromEntries(document.pieces.map((p,i)=>[p.id,{x:(i%10)*150,y:Math.floor(i/10)*150,rotation:0}])),mode:'large',paper:'A4',margin:10};
document.preparations=[preparation];document.revisionId=revisionId(document);
const font=await readFile('.local/assets/NotoSans-Regular.ttf'),snapshot=Buffer.from(JSON.stringify(document)),root=await mkdtemp(join(tmpdir(),'patron-pdf-performance-'));
const adapter=windowsAdapter(resolve('apps/desktop/native/build/Release/file_replace.node'));
async function buildDigest(){const hash=createHash('sha256');for(const directory of ['dist/packages/geometry/src','dist/packages/print/src','dist/packages/document/src','dist/apps/desktop/src/main/print'])for(const file of (await readdir(directory,{recursive:true})).filter(p=>p.endsWith('.js')).sort()){hash.update(directory+'/'+file);hash.update(await readFile(join(directory,file)));}return hash.digest('hex');}
const buildHash=await buildDigest();
const report={name,cancelMode,startedAt:new Date().toISOString(),buildHash,inputHash:createHash('sha256').update(snapshot).digest('hex'),fontHash:createHash('sha256').update(font).digest('hex'),pieces:load[0],segmentsPerPiece:load[1],node:process.version,os:release(),cpu:cpus()[0]?.model,logicalCpus:cpus().length,totalmem:totalmem(),runs:[]};
await mkdir('.local/validation',{recursive:true});
try{
 for(let i=0;i<10;i++){
  const started=performance.now(),job=new ExportJob(snapshot,preparation.id,font,pathToFileURL(resolve('dist/apps/desktop/src/main/print/export-runner.js')));
  let watchdog=false;
  let generationEvents=0,cancelTimer,cancelAt,cancellingImmediate=false;
  if(cancelMode)job.subscribe(p=>{if(p.state==='generating'&&++generationEvents===2)cancelTimer=setTimeout(()=>{cancelAt=performance.now();const stopped=job.cancel();cancellingImmediate=job.progress.state==='cancelling';void stopped;},1000);});
  // Harness guard only; never changes the product's no-timeout behavior.
  const timer=setTimeout(()=>{watchdog=true;void job.cancel();},120000);
  let row;
  try{
   const result=await job.finished;
   if(cancelMode&&cancelAt!==undefined&&!watchdog){const cancelMs=performance.now()-cancelAt;row={run:i+1,state:job.progress.state,cancelMs,cancellingImmediate,withinTarget:job.progress.state==='cancelled'&&cancellingImmediate&&cancelMs<=5000};}
   else if(!result)row={run:i+1,state:watchdog?'harness-timeout':job.progress.state,error:job.progress.error,totalMs:performance.now()-started};
   else{
    const generatedMs=performance.now()-started;
    const saved=await saveVerifiedPdf(join(root,`run-${i+1}.pdf`),result.bytes,null,adapter,()=>false);
    const totalMs=performance.now()-started;
    row={run:i+1,state:saved?'saved':'not-saved',generatedMs,totalMs,withinTarget:saved&&totalMs<=60000,bytes:result.bytes.length,pages:result.measurement.pages.length};
   }
  }finally{clearTimeout(timer);clearTimeout(cancelTimer);await job.cancel();}
  if(await buildDigest()!==buildHash)row={...row,state:'build-changed',withinTarget:false};
  report.runs.push(row);await writeFile(`.local/validation/pdf-${cancelMode?'cancellation':'performance'}-${name}.json`,JSON.stringify(report,null,2));console.log(JSON.stringify({case:name,cancelMode,...row}));
  if(row.state!==(cancelMode?'cancelled':'saved')||!row.withinTarget){process.exitCode=1;break;}
 }
}finally{if(!resolve(root).startsWith(resolve(tmpdir(),'patron-pdf-performance-')))throw Error('UNSAFE_CLEANUP');await rm(root,{recursive:true,force:true});}
