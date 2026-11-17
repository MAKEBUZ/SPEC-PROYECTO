import { it,expect } from 'vitest';
import { _electron,expect as ui } from '@playwright/test';
import { resolve,join } from 'node:path';
import { mkdtemp,rm,readFile,writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';

it('saves, reopens and saves on close through the real Windows adapter',async()=>{
  const env=Object.fromEntries(Object.entries(process.env).filter((pair):pair is [string,string]=>pair[1]!==undefined));delete env.ELECTRON_RUN_AS_NODE;
  const root=await mkdtemp(join(tmpdir(),'patron-native-e2e-')),file=join(root,'patrón.patron');
  const app=await _electron.launch({executablePath:resolve('node_modules/electron/dist/electron.exe'),args:[resolve('dist/tests/desktop/cad-host.js'),`--user-data-dir=${join(root,'profile')}`],env});
  try{
    // Only automate dialog choices. Filesystem, writer, IPC and addon are real.
    await app.evaluate(({dialog},path)=>{
      Object.defineProperty(dialog,'showSaveDialog',{configurable:true,value:async()=>({canceled:false,filePath:path})});
      Object.defineProperty(dialog,'showOpenDialog',{configurable:true,value:async()=>({canceled:false,filePaths:[path]})});
      Object.defineProperty(dialog,'showMessageBoxSync',{configurable:true,value:()=>0});
    },file);
    const page=await app.firstWindow();await page.getByRole('button',{name:'Abrir CAD',exact:true}).click();
    const draw=async()=>{const form=page.locator('form[data-action="draw"]');const advanced=page.locator('details').filter({has:page.locator('form[data-action=draw]')});if(!await advanced.evaluate(e=>e.hasAttribute('open')))await advanced.locator(':scope > summary').click();await form.locator('[name=vertices]').fill('0,0\n20,0');await form.getByRole('button').click();};
    await draw();await page.getByRole('button',{name:'Guardar',exact:true}).click();
    await expect.poll(async()=>{try{return JSON.parse(await readFile(file,'utf8')).pieces.length;}catch{return -1;}}).toBe(1);
    const saved=JSON.parse(await readFile(file,'utf8'));
    await page.getByRole('button',{name:'Nuevo documento',exact:true}).click();
    await expect.poll(async()=>JSON.parse((await page.getByTestId('cad-snapshot').textContent())!).pieces.length).toBe(0);
    await page.getByRole('button',{name:'Abrir archivo',exact:true}).click();
    await expect.poll(async()=>JSON.parse((await page.getByTestId('cad-snapshot').textContent())!).documentId).toBe(saved.documentId);
    const before=await page.getByTestId('cad-snapshot').textContent();
    const invalid=join(root,'future.patron');await writeFile(invalid,JSON.stringify({...saved,formatVersion:2}));
    await app.evaluate(({dialog},path)=>{Object.defineProperty(dialog,'showOpenDialog',{configurable:true,value:async()=>({canceled:false,filePaths:[path]})});},invalid);
    await page.getByRole('button',{name:'Abrir archivo',exact:true}).click();
    await ui(page.getByTestId('file-error')).toContainText('se conserva');expect(await page.getByTestId('cad-snapshot').textContent()).toBe(before);
    await writeFile(file,'external edit');await page.getByRole('button',{name:'Guardar',exact:true}).click();
    await ui(page.getByTestId('file-error')).toContainText('cambió fuera');expect(await readFile(file,'utf8')).toBe('external edit');
    const other=join(root,'independiente.patron');
    await app.evaluate(({dialog},path)=>{Object.defineProperty(dialog,'showSaveDialog',{configurable:true,value:async()=>({canceled:false,filePath:path})});},other);
    await page.getByRole('button',{name:'Guardar como',exact:true}).click();
    await expect.poll(async()=>{try{return JSON.parse(await readFile(other,'utf8')).documentId;}catch{return null;}}).toBe(saved.documentId);
    await draw();await ui(page.getByTestId('cad-snapshot')).toContainText(saved.documentId);
    const closed=app.waitForEvent('close');await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0]!.close()).catch(()=>{});await closed;
    const final=JSON.parse(await readFile(other,'utf8'));expect(final.pieces).toHaveLength(2);expect(final.revisionId).not.toBe(saved.revisionId);expect(await readFile(file,'utf8')).toBe('external edit');
  }finally{await app.evaluate(({app})=>app.exit(0)).catch(()=>{});await rm(root,{recursive:true,force:true});}
},60000);
