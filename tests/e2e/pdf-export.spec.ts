import {it,expect} from 'vitest';
import {_electron,expect as ui} from '@playwright/test';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pdfFixture} from '../support/pdf-fixture.js';
import {verifyPrintPdf} from '../../packages/print/src/verify.js';
import {revisionId} from '../../packages/document/src/revision.js';
it('saves edits before generating a verified PDF through the Electron UI',async()=>{
 const root=await mkdtemp(join(tmpdir(),'patron-pdf-ui-')),source=join(root,'prueba.patron'),target=join(root,'prueba.pdf'),{document,preparation}=pdfFixture();
 await writeFile(source,JSON.stringify(document));
 const env=Object.fromEntries(Object.entries(process.env).filter((p):p is [string,string]=>p[1]!==undefined));delete env.ELECTRON_RUN_AS_NODE;
 const app=await _electron.launch({executablePath:resolve('node_modules/electron/dist/electron.exe'),args:[resolve('dist/tests/desktop/cad-host.js'),`--user-data-dir=${join(root,'profile')}`],env});
 
 try{
  await app.evaluate(({dialog},{source,target})=>{
   Object.defineProperty(dialog,'showOpenDialog',{configurable:true,value:async()=>({canceled:false,filePaths:[source]})});
   Object.defineProperty(dialog,'showSaveDialog',{configurable:true,value:async(_window:unknown,options:{filters:{extensions:string[]}[]})=>({canceled:false,filePath:options.filters[0]!.extensions.includes('pdf')?target:source})});
   Object.defineProperty(dialog,'showMessageBox',{configurable:true,value:async()=>({response:0})});
  },{source,target});
  const page=await app.firstWindow();await page.getByRole('button',{name:'Abrir archivo',exact:true}).click();await ui(page.getByTestId('cad-snapshot')).toBeAttached();
  await page.getByRole('button',{name:'Preparar impresión',exact:true}).click();await page.getByLabel('Preparación guardada').selectOption(preparation.id);
  const config=page.locator('form[data-action="preparation-config"]');await config.locator('[name=margin]').fill('11');await config.getByRole('button').click();
  await page.getByRole('button',{name:'Generar PDF',exact:true}).click();await ui(page.getByText('PDF guardado: prueba.pdf',{exact:true})).toBeVisible({timeout:15000});
  const saved=JSON.parse(await readFile(source,'utf8'));expect(saved.preparations[0].margin).toBe(11);
  expect((await verifyPrintPdf(await readFile(target),saved,preparation.id)).scale).toBe(1);await ui(config.locator('[name=margin]')).toBeEnabled();
  const previous=await readFile(target),piece=document.pieces[0]!,segment=piece.contour.segments[0]!;
  piece.contour.segments[0]={...segment,kind:'cubic',handleStart:{x:25,y:-20},handleEnd:{x:75,y:-20}};piece.seamWidth=0;preparation.transforms[piece.id]!.rotation=37;document.revisionId=revisionId(document);await writeFile(source,JSON.stringify(document));
  await page.getByRole('button',{name:'Abrir archivo',exact:true}).click();await ui(page.getByTestId('cad-snapshot')).toBeAttached();await page.getByRole('button',{name:'Preparar impresión',exact:true}).click();await page.getByLabel('Preparación guardada').selectOption(preparation.id);
  await page.getByRole('button',{name:'Generar PDF',exact:true}).click();const cancel=page.getByRole('button',{name:'Cancelar exportación',exact:true});await ui(cancel).toBeVisible();await ui(page.getByText(/Tiempo de exportación:/)).toBeVisible();
  const started=performance.now();await cancel.click();await ui(page.getByText('Exportación cancelada',{exact:true})).toBeVisible({timeout:5000});expect(performance.now()-started).toBeLessThan(5000);expect(await readFile(target)).toEqual(previous);await ui(page.locator('form[data-action="preparation-config"] [name=margin]')).toBeEnabled();
  const invalid=pdfFixture();invalid.document.pieces[0]!.name='';invalid.document.pieces[0]!.grainline=null;invalid.document.revisionId=revisionId(invalid.document);
  await writeFile(source,JSON.stringify(invalid.document));
  await page.getByRole('button',{name:'Abrir archivo',exact:true}).click();await ui(page.getByTestId('cad-snapshot')).toBeAttached();
  await page.getByRole('button',{name:'Preparar impresión',exact:true}).click();await page.getByLabel('Preparación guardada').selectOption(invalid.preparation.id);
  await page.getByRole('button',{name:'Generar PDF',exact:true}).click();
  await ui(page.getByRole('alert')).toContainText('Falta el nombre de la pieza');
  await ui(page.getByRole('alert')).toContainText('inicio y fin distintos');
  expect(await page.getByRole('alert').textContent()).not.toContain('PRODUCTION_INVALID');
  expect(await readFile(target)).toEqual(previous);
 }finally{
  await app.evaluate(({dialog})=>{Object.defineProperty(dialog,'showMessageBoxSync',{configurable:true,value:()=>1});});await app.close();
  if(!resolve(root).startsWith(resolve(tmpdir())+'\\'))throw Error('Unexpected test directory');await rm(root,{recursive:true,force:true,maxRetries:5,retryDelay:100});
 }
},60000);
