import { it,expect } from 'vitest';
import { _electron,expect as ui } from '@playwright/test';
import { mkdtemp,rm,readFile,writeFile } from 'node:fs/promises';
import { join,resolve } from 'node:path';
import { tmpdir } from 'node:os';
it('confirms scope, cancels, then recycles only the test editable through the real Windows bin',async()=>{
 const root=await mkdtemp(join(tmpdir(),'patron-trash-ui-')),file=join(root,'ensayo-papelera.patron'),pdf=join(root,'conservar.pdf');await writeFile(pdf,'PDF vecino de ensayo');
 const env=Object.fromEntries(Object.entries(process.env).filter((p):p is [string,string]=>p[1]!==undefined));delete env.ELECTRON_RUN_AS_NODE;
 const app=await _electron.launch({executablePath:resolve('node_modules/electron/dist/electron.exe'),args:[resolve('dist/tests/desktop/cad-host.js'),`--user-data-dir=${join(root,'profile')}`],env});
 try{
  await app.evaluate(({dialog},path)=>{Object.defineProperty(dialog,'showSaveDialog',{configurable:true,value:async()=>({canceled:false,filePath:path})});},file);
  const page=await app.firstWindow();await page.getByRole('button',{name:'Abrir CAD',exact:true}).click();
  const form=page.locator('form[data-action="draw"]');const advanced=page.locator('details').filter({has:page.locator('form[data-action=draw]')});if(!await advanced.evaluate(e=>e.hasAttribute('open')))await advanced.locator(':scope > summary').click();await form.locator('[name=vertices]').fill('0,0\n20,0');await form.getByRole('button').click();await page.getByRole('button',{name:'Guardar',exact:true}).click();
  await expect.poll(async()=>{try{return JSON.parse(await readFile(file,'utf8')).pieces.length;}catch{return -1;}}).toBe(1);
  await app.evaluate(({dialog})=>{Object.defineProperty(dialog,'showMessageBoxSync',{configurable:true,value:(options:Electron.MessageBoxSyncOptions)=>{if(!options.detail?.includes('PDF')||!options.message.includes('ensayo-papelera.patron'))throw Error('Missing scope');return 1;}});});
  await page.getByRole('button',{name:'Eliminar copia local',exact:true}).click();expect(JSON.parse(await readFile(file,'utf8')).pieces).toHaveLength(1);
  await app.evaluate(({dialog})=>{Object.defineProperty(dialog,'showMessageBoxSync',{configurable:true,value:()=>0});});
  await page.getByRole('button',{name:'Eliminar copia local',exact:true}).click();
  await expect.poll(async()=>JSON.parse((await page.getByTestId('cad-snapshot').textContent())!).pieces.length).toBe(0);
  await expect(readFile(file)).rejects.toMatchObject({code:'ENOENT'});expect(await readFile(pdf,'utf8')).toBe('PDF vecino de ensayo');
  await ui(page.getByTestId('file-error')).toHaveCount(0);
 }finally{const closed=app.waitForEvent('close');await app.evaluate(({app})=>app.exit(0)).catch(()=>{});await closed;await rm(root,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
},30000);
