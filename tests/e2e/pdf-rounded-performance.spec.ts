import {it,expect} from 'vitest';
import {_electron,expect as ui} from '@playwright/test';
import {mkdtemp,writeFile,readFile,readdir,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {roundedObliqueFixture} from '../support/rounded-oblique-fixture.js';

it('completes rounded oblique PDF generation, independent verification, native save and catalog within 60 seconds',async()=>{
 const root=await mkdtemp(join(tmpdir(),'patron-rounded-ui-')),source=join(root,'rounded.patron'),target=join(root,'rounded.pdf');
 const {document,preparation}=await roundedObliqueFixture();await writeFile(source,JSON.stringify(document));
 const env=Object.fromEntries(Object.entries(process.env).filter((p):p is [string,string]=>p[1]!==undefined));delete env.ELECTRON_RUN_AS_NODE;
 const app=await _electron.launch({executablePath:resolve('node_modules/electron/dist/electron.exe'),args:[resolve('dist/tests/desktop/cad-host.js'),`--user-data-dir=${join(root,'profile')}`],env});
 try{
  const catalog=await app.evaluate(({app})=>app.getPath('userData')+'/pdf-artifacts');
  await app.evaluate(({dialog},{source,target})=>{
   Object.defineProperty(dialog,'showOpenDialog',{configurable:true,value:async()=>({canceled:false,filePaths:[source]})});
   Object.defineProperty(dialog,'showSaveDialog',{configurable:true,value:async()=>({canceled:false,filePath:target})});
   Object.defineProperty(dialog,'showMessageBox',{configurable:true,value:async()=>({response:0})});
  },{source,target});
  const page=await app.firstWindow();await page.getByRole('button',{name:'Abrir archivo',exact:true}).click();await ui(page.getByTestId('cad-snapshot')).toBeAttached();
  await page.getByRole('button',{name:'Preparar impresión',exact:true}).click();await page.getByLabel('Preparación guardada').selectOption(preparation.id);
  const started=performance.now();await page.getByRole('button',{name:'Generar PDF',exact:true}).click();
  await ui(page.getByText('PDF guardado: rounded.pdf',{exact:true})).toBeVisible({timeout:60000});
  const files=await readdir(catalog),metadata=files.filter(f=>f.endsWith('.json'));expect(metadata).toHaveLength(1);
  const artifact=JSON.parse(await readFile(join(catalog,metadata[0]!),'utf8')),bytes=await readFile(target);
  expect(artifact.sha256).toBe(createHash('sha256').update(bytes).digest('hex'));
  expect(await readFile(join(catalog,artifact.id+'.pdf'))).toEqual(bytes);
  const elapsedMs=Math.round(performance.now()-started);expect(elapsedMs).toBeLessThan(60000);
  expect(await readFile(source,'utf8')).toBe(JSON.stringify(document));
  await ui(page.locator('form[data-action="preparation-config"] [name=margin]')).toBeEnabled();
  await mkdir('.local/validation',{recursive:true});
  await writeFile('.local/validation/pdf-rounded-end-to-end.json',JSON.stringify({date:new Date().toISOString(),elapsedMs,objectiveMs:60000,bytes:bytes.length,scope:'Electron UI, generation, independent verification, native save, publication catalog; no network',passed:true},null,2));
  console.info('Rounded PDF complete export (ms):',elapsedMs);
 }finally{
  await app.evaluate(({dialog})=>{Object.defineProperty(dialog,'showMessageBoxSync',{configurable:true,value:()=>1});});await app.close();
  if(!resolve(root).startsWith(resolve(tmpdir(),'patron-rounded-ui-')))throw Error('Unsafe cleanup');await rm(root,{recursive:true,force:true,maxRetries:5,retryDelay:100});
 }
},90000);
