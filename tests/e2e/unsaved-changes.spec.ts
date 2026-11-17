import { it,expect } from 'vitest';
import { _electron,expect as ui } from '@playwright/test';
import { resolve,join } from 'node:path';
import { mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
it('protects dirty documents on new and native close, including unavailable saving',async()=>{
  const env=Object.fromEntries(Object.entries(process.env).filter((pair):pair is [string,string]=>pair[1]!==undefined));delete env.ELECTRON_RUN_AS_NODE;
  const root=await mkdtemp(join(tmpdir(),'patron-leave-'));
  const app=await _electron.launch({executablePath:resolve('node_modules/electron/dist/electron.exe'),args:[resolve('dist/tests/desktop/cad-host.js'),`--user-data-dir=${root}`],env});
  const choose=(responses:number[])=>app.evaluate(({dialog},values)=>{Object.defineProperty(dialog,'showMessageBoxSync',{configurable:true,value:()=>values.shift()??2});},responses);
  try{
    await app.evaluate(({dialog})=>{Object.defineProperty(dialog,'showSaveDialog',{configurable:true,value:async()=>{throw Error('Injected dialog failure');}});});
    const page=await app.firstWindow();await page.getByRole('button',{name:'Abrir CAD',exact:true}).click();
    const draw=async()=>{const f=page.locator('form[data-action="draw"]');const advanced=page.locator('details').filter({has:page.locator('form[data-action=draw]')});if(!await advanced.evaluate(e=>e.hasAttribute('open')))await advanced.locator(':scope > summary').click();await f.locator('[name=vertices]').fill('0,0\n20,0');await f.getByRole('button').click();};
    await draw();const before=await page.getByTestId('cad-snapshot').textContent();
    await choose([2]);await page.getByRole('button',{name:'Nuevo documento',exact:true}).click();expect(await page.getByTestId('cad-snapshot').textContent()).toBe(before);
    await choose([0]);await page.getByRole('button',{name:'Nuevo documento',exact:true}).click();await ui(page.getByTestId('file-error')).toContainText('se conserva');expect(await page.getByTestId('cad-snapshot').textContent()).toBe(before);
    await choose([1]);await page.getByRole('button',{name:'Nuevo documento',exact:true}).click();await expect.poll(async()=>JSON.parse((await page.getByTestId('cad-snapshot').textContent())!).pieces.length).toBe(0);
    await draw();await page.getByRole('button',{name:'Cuenta',exact:true}).click();
    for(const choices of [[2],[0,0]]){
      await choose(choices);await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0]!.close());
      await ui(page.getByRole('button',{name:'Abrir CAD',exact:true})).toBeVisible();
      expect(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().length)).toBe(1);
    }
    await page.getByRole('button',{name:'Abrir CAD',exact:true}).click();expect(JSON.parse((await page.getByTestId('cad-snapshot').textContent())!).pieces.length).toBe(1);
    await choose([1]);const closed=app.waitForEvent('close');await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0]!.close()).catch(()=>{});await closed;
  }finally{await app.evaluate(({app})=>app.exit(0)).catch(()=>{});await rm(root,{recursive:true,force:true});}
},30000);
