import { it,expect } from 'vitest';
import { _electron,expect as ui } from '@playwright/test';
import { resolve,join } from 'node:path';
import { mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
it('captures an edited document and recovers it after restarting Electron without saving or publishing',async()=>{
  const env=Object.fromEntries(Object.entries(process.env).filter((pair):pair is [string,string]=>pair[1]!==undefined));delete env.ELECTRON_RUN_AS_NODE;
  const root=await mkdtemp(join(tmpdir(),'patron-recovery-ui-'));
  const launch=()=>_electron.launch({executablePath:resolve('node_modules/electron/dist/electron.exe'),args:[resolve('dist/tests/desktop/cad-host.js'),`--user-data-dir=${root}`],env});
  let app=await launch();
  try{
    let page=await app.firstWindow();
    await page.getByRole('button',{name:'Abrir CAD',exact:true}).click();
    const draw=page.locator('form[data-action="draw"]');const advanced=page.locator('details').filter({has:page.locator('form[data-action=draw]')});if(!await advanced.evaluate(e=>e.hasAttribute('open')))await advanced.locator(':scope > summary').click();await draw.locator('[name=vertices]').fill('0,0\n40,0\n40,30');await draw.getByRole('button').click();
    const before=JSON.parse((await page.getByTestId('cad-snapshot').textContent())!);

    await expect.poll(async()=>page.evaluate(async id=>{
      const r=await window.patron.request({requestId:crypto.randomUUID(),method:'recovery.inspect'});
      const candidate=(r.data as {candidates:{recoveryId:string;documentId:string}[]}).candidates.find(c=>c.documentId===id);
      if(!candidate)return 0;
      const restored=await window.patron.request({requestId:crypto.randomUUID(),method:'recovery.restore',recoveryId:candidate.recoveryId,confirmed:true});
      return (restored.data as {snapshot:{pieces:unknown[]}}).snapshot.pieces.length;
    },before.documentId),{timeout:65000,interval:1000}).toBe(1);
    await app.evaluate(({dialog})=>{Object.defineProperty(dialog,'showMessageBoxSync',{configurable:true,value:()=>1});});await app.close();app=await launch();page=await app.firstWindow();
    await page.getByRole('button',{name:'Recuperación local',exact:true}).click();
    const row=page.getByRole('listitem').filter({hasText:before.documentId});await ui(row).toBeVisible();
    page.on('dialog',dialog=>void dialog.accept());await row.getByRole('button',{name:'Recuperar copia',exact:true}).click();
    await ui(page.getByTestId('cad-snapshot')).toBeAttached();
    expect(JSON.parse((await page.getByTestId('cad-snapshot').textContent())!).pieces).toEqual(before.pieces);
    await page.getByRole('button',{name:'Recuperación local',exact:true}).click();
    await ui(page.getByRole('button',{name:'Recuperar copia',exact:true}).first()).toBeDisabled();
  }finally{await app.evaluate(({dialog})=>{Object.defineProperty(dialog,'showMessageBoxSync',{configurable:true,value:()=>1});});await app.close();await rm(root,{recursive:true,force:true});}
},90000);
it('discards a recovery only after explicit confirmation in the interface',async()=>{
  const env=Object.fromEntries(Object.entries(process.env).filter((pair):pair is [string,string]=>pair[1]!==undefined));delete env.ELECTRON_RUN_AS_NODE;
  const root=await mkdtemp(join(tmpdir(),'patron-recovery-discard-'));
  const app=await _electron.launch({executablePath:resolve('node_modules/electron/dist/electron.exe'),args:[resolve('dist/tests/desktop/cad-host.js'),`--user-data-dir=${root}`],env});
  try{
    const page=await app.firstWindow();await page.getByRole('button',{name:'Recuperación local',exact:true}).click();
    await expect.poll(async()=>page.evaluate(async()=>{
      const r=await window.patron.request({requestId:crypto.randomUUID(),method:'recovery.inspect'});
      return (r.data as {candidates:unknown[]}).candidates.length;
    })).toBe(1);
    await page.getByRole('button',{name:'Actualizar copias',exact:true}).click();
    await ui(page.getByRole('status')).toContainText('Copias actualizadas:');
    await ui(page.locator('time').first()).toHaveAttribute('datetime',/T/);
    expect(await page.locator('time').first().textContent()).not.toMatch(/T\d\d:/);
    const discard=page.getByRole('button',{name:'Descartar copia',exact:true});await ui(discard).toBeVisible();
    page.once('dialog',d=>void d.dismiss());await discard.click();await ui(discard).toBeVisible();
    page.once('dialog',d=>void d.accept());await discard.click();
    await ui(page.getByText('No hay copias disponibles.',{exact:true})).toBeVisible();
  }finally{await app.evaluate(({dialog})=>{Object.defineProperty(dialog,'showMessageBoxSync',{configurable:true,value:()=>1});});await app.close();await rm(root,{recursive:true,force:true});}
},30000);
