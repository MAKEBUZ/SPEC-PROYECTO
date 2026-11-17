import {readFile,writeFile} from 'node:fs/promises';
const cases=['small','medium','large','maximum-format','250-pages'];
const read=async name=>JSON.parse(await readFile(`.local/validation/${name}.json`,'utf8'));
const generation=await Promise.all(cases.map(c=>read(`pdf-performance-${c}`)));
const cancellation=await Promise.all(cases.slice(0,3).map(c=>read(`pdf-cancellation-${c}`)));
const buildHash=generation[0].buildHash;
for(const report of [...generation,...cancellation]){
 if(!buildHash||report.buildHash!==buildHash||report.runs.length!==10)throw Error('INCOMPLETE_OR_MIXED_PDF_EVIDENCE');
 for(const [i,row] of report.runs.entries()){
  const duration=report.cancelMode?row.cancelMs:row.totalMs;
  if(row.run!==i+1||!row.withinTarget||!Number.isFinite(duration)||duration<0||duration>(report.cancelMode?5000:60000)||row.state!==(report.cancelMode?'cancelled':'saved')||report.cancelMode&&!row.cancellingImmediate)throw Error('PDF_TARGET_NOT_MET');
 }
}
const platforms=await read('pdf-platforms'),regression=await read('pdf-regression');
if(JSON.stringify(platforms.windows)!==JSON.stringify(platforms.linux)||platforms.windows.cases.length!==5||!regression.success||regression.numFailedTests!==0)throw Error('PDF_VALIDATION_INCOMPLETE');
const evidence={recordedAt:new Date().toISOString(),buildHash,scope:'Local Windows measurements; not reference hardware or physical printing',generation,cancellation,platforms,regression:{success:regression.success,total:regression.numTotalTests,passed:regression.numPassedTests,failed:regression.numFailedTests,files:regression.testResults.map(r=>({file:r.name.replaceAll('\\','/').split('/PATRON/').at(-1),status:r.status}))}};
await writeFile('docs/validation/pdf-performance-results.json',JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify({generation:generation.map(r=>({name:r.name,runs:r.runs.length,maxMs:Math.max(...r.runs.map(v=>v.totalMs))})),cancellation:cancellation.map(r=>({name:r.name,runs:r.runs.length,maxMs:Math.max(...r.runs.map(v=>v.cancelMs))})),regression:evidence.regression.passed,platforms:platforms.windows.cases.length}));
