import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,relative} from 'node:path';

const source=await readFile('specs/001-patronaje/coverage.md','utf8');
const tasks=await readFile('specs/001-patronaje/tasks.md','utf8');
const spec=await readFile('specs/001-patronaje/spec.md','utf8');
const reportPath=process.argv[2]??'.local/validation/acceptance-local.json';
const bytes=await readFile(reportPath),report=JSON.parse(bytes);
if(!Array.isArray(report.testResults)||!Number.isSafeInteger(report.numTotalTests))throw Error('INVALID_TEST_REPORT');
const hash=value=>createHash('sha256').update(value).digest('hex');
const clean=value=>String(value).replaceAll('|','\\|').replaceAll('\n',' ');
const taskRows=new Map([...tasks.matchAll(/^- \[([ xX])\] (T\d+) (.+)$/gm)].map(m=>[m[2],{done:m[1].toLowerCase()==='x',files:[...m[3].matchAll(/`(tests\/[^`]+\.spec\.ts)`/g)].map(v=>v[1])}]));
const executed=new Map(report.testResults.map(r=>[relative(resolve('.'),r.name).replaceAll('\\','/'),r]));
const rows=new Map();
for(const line of source.split(/\r?\n/)){
 const match=line.match(/^\| ((?:FR|SC)-\d{3}) \| ([^|]+) \| ([^|]*) \| (.*) \| ([^|]*) \|$/);if(!match)continue;
 const [,id,scope,assigned,criterion]=match;
 const previous=rows.get(id);
 if(previous){if(previous.scope!==scope.trim())throw Error('CONFLICTING_SCOPE:'+id);continue;}
 rows.set(id,{scope:scope.trim(),assigned:assigned.trim(),criterion});
}
const required=new Set(spec.match(/\b(?:FR|SC)-\d{3}\b/g));
if(required.size!==rows.size||[...required].some(id=>!rows.has(id)))throw Error('COVERAGE_IDS_INCOMPLETE');
let deferred=0,linked=0,gaps=0;
const output=[];
for(const [id,row] of rows){
 const ids=row.assigned.match(/T\d+/g)??[];
 const references=new Set(ids.flatMap(t=>taskRows.get(t)?.files??[]));
 // Explicit test titles provide traceability; a reference never implies that
 // all clauses of a compound requirement have passed.
 for(const [file,result] of executed)if(result.assertionResults?.some(a=>new RegExp('\\b'+id+'\\b').test(a.fullName)))references.add(file);
 const tested=[...references].filter(file=>executed.has(file));
 const evidence=tested.map(file=>`${file}: ${executed.get(file).status}`).join('; ');
 const outstanding=ids.filter(t=>!taskRows.get(t)?.done);
 let state;
 if(row.scope==='Aplazado'){state='Fuera de entrega';deferred++;}
 else if(tested.length){state='Evidencia parcial; falta acreditar cada cláusula';linked++;}
 else{state='No acreditado: sin evidencia individual en esta ejecución';gaps++;}
 output.push(`| ${id} | ${clean(row.scope)} | ${clean(row.assigned)} | ${clean(row.criterion)} | ${state} | ${clean(evidence||'—')} | ${outstanding.join(', ')||'Revisión individual pendiente'} |`);
}
const header=`# Matriz de aceptación ejecutada — primera entrega\n\nGenerada desde coverage.md y una ejecución real de Vitest. **La entrega no está aceptada.** Una prueba de tarea relacionada no demuestra por sí sola todo un requisito compuesto. Se conservan los requisitos aplazados y se señalan los huecos sin inventar cumplimiento.\n\n- Requisitos/escenarios únicos: ${rows.size}.\n- Aplazados: ${deferred}; con evidencia parcial vinculada: ${linked}; sin evidencia individual en esta ejecución: ${gaps}.\n- Ejecución: ${report.numPassedTests}/${report.numTotalTests} pruebas aprobadas; ${report.numFailedTests} fallidas.\n- Inicio UTC: ${new Date(report.startTime).toISOString()}.\n- SHA-256 del informe: ${hash(bytes)}.\n- SHA-256 de coverage.md: ${hash(source)}.\n- SHA-256 de spec.md: ${hash(spec)}.\n\nInforme original local: ${reportPath.replaceAll('\\','/')}. Reproducción: ejecutar las suites con reportero JSON y luego \`node tools/validation/acceptance-matrix.mjs <informe.json>\`. El generador verifica que no falte ningún ID de la spec. No modifica la spec, sus alcances ni los estados de tasks.md.\n\nLas ejecuciones de API, E2E, impresión y ensayos físicos deben añadirse y revisarse antes de cerrar T097. Sus informes existentes en docs/validation conservan su validez, pero esta matriz no los convierte automáticamente en aceptación individual.\n\n| ID | Alcance | Tareas | Criterio original | Evaluación | Evidencia ejecutada vinculada | Pendientes |\n|---|---|---|---|---|---|---|\n`;
await mkdir('docs/validation',{recursive:true});
await writeFile('docs/validation/acceptance-matrix.md',header+output.join('\n')+'\n');
console.log(JSON.stringify({requirements:rows.size,deferred,linked,gaps,passed:report.numPassedTests,total:report.numTotalTests}));
