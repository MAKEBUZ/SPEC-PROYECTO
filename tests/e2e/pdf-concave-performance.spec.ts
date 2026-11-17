import {it,expect} from 'vitest';
import {_electron,expect as ui} from '@playwright/test';
import {mkdtemp,writeFile,readFile,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {roundedObliqueFixture} from '../support/rounded-oblique-fixture.js';

it('finishes the concave 10 mm margin diagnosis without changing the document or previous PDF',async()=>{
 const root=await mkdtemp(join(tmpdir(),'patron-concave-ui-')),source=join(root,'concave.patron'),target=join(root,'previous.pdf');
 const {document,preparation}=await roundedObliqueFixture('tests/support/concave-rounded.json'),original=JSON.stringify(document);
 await writeFile(source,original);await writeFile(target,'previous file must remain intact');
 const env=Object.fromEntries(Object.entries(process.env).filter((p):p is [string,string]=>p[1]!==undefined));delete env.ELECTRON_RUN_AS_NODE;
 const app=await _electron.launch({executablePath:resolve('node_modules/electron/dist/electron.exe'),args:[resolve('dist/tests/desktop/cad-host.js'),`--user-data-dir=${join(root,'profile')}`],env});
 try{
  await app.evaluate(({dialog},{source,target})=>{
   Object.defineProperty(dialog,'showOpenDialog',{configurable:true,value:async()=>({canceled:false,filePaths:[source]})});
   Object.defineProperty(dialog,'showSaveDialog',{configurable:true,value:async()=>({canceled:false,filePath:target})});
   Object.defineProperty(dialog,'showMessageBox',{configurable:true,value:async()=>({response:0})});
  },{source,target});
  const page=await app.firstWindow();await page.getByRole('button',{name:'Abrir archivo',exact:true}).click();await ui(page.getByTestId('cad-snapshot')).toBeAttached();
  await page.getByRole('button',{name:'Preparar impresión',exact:true}).click();await page.getByLabel('Preparación guardada').selectOption(preparation.id);
  const started=performance.now();await page.getByRole('button',{name:'Generar PDF',exact:true}).click();
  await ui(page.getByRole('alert')).toContainText('varias intersecciones posibles en una unión cóncava',{timeout:60000});
  const elapsedMs=Math.round(performance.now()-started);expect(elapsedMs).toBeLessThan(60000);
  expect(await readFile(source,'utf8')).toBe(original);expect(JSON.parse(original).pieces[0].seamWidth).toBe(10);
  expect(await readFile(target,'utf8')).toBe('previous file must remain intact');
  await ui(page.getByRole('button',{name:'Generar PDF',exact:true})).toBeEnabled();
  await mkdir('.local/validation',{recursive:true});await writeFile('.local/validation/pdf-concave-end-to-end.json',JSON.stringify({date:new Date().toISOString(),elapsedMs,objectiveMs:60000,result:'technical-error: ambiguous local trim',marginMm:10,originalUnchanged:true,previousPdfUnchanged:true,scope:'Electron UI, complete validation and explicit failure, no network',passed:true},null,2));
 }finally{
  await app.evaluate(({dialog})=>{Object.defineProperty(dialog,'showMessageBoxSync',{configurable:true,value:()=>1});});await app.close();
  if(!resolve(root).startsWith(resolve(tmpdir(),'patron-concave-ui-')))throw Error('Unsafe cleanup');await rm(root,{recursive:true,force:true,maxRetries:5,retryDelay:100});
 }
},90000);
