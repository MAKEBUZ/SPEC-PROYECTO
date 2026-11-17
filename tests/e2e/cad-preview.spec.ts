import { it,expect } from 'vitest';
import { _electron } from '@playwright/test';
import { mkdtemp,readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join,resolve } from 'node:path';

it('keeps editing responsive while exact margin validation runs, discarding obsolete workers',async()=>{
  const env=Object.fromEntries(Object.entries(process.env).filter((p):p is [string,string]=>p[1]!==undefined));delete env.ELECTRON_RUN_AS_NODE;
  const dir=await mkdtemp(join(tmpdir(),'patron-preview-'));
  const app=await _electron.launch({executablePath:resolve('node_modules/electron/dist/electron.exe'),args:[resolve('dist/tests/desktop/cad-host.js'),`--user-data-dir=${dir}`],env});
  try {
    const file=join(dir,'preview.patron');
    await app.evaluate(({dialog},file)=>{
      Object.defineProperty(dialog,'showSaveDialog',{configurable:true,value:async()=>({canceled:false,filePath:file})});
      Object.defineProperty(dialog,'showOpenDialog',{configurable:true,value:async()=>({canceled:false,filePaths:[file]})});
    },file);
    const page=await app.firstWindow();
    await page.getByRole('button',{name:'Abrir CAD',exact:true}).click();
    const draw=page.locator('form[data-action="draw"]');const advanced=page.locator('details').filter({has:page.locator('form[data-action=draw]')});if(!await advanced.evaluate(e=>e.hasAttribute('open')))await advanced.locator(':scope > summary').click();
    await draw.locator('textarea').fill('280,80\n440,80\n440,180\n100,140');
    await draw.getByRole('button').click();
    await page.getByRole('button',{name:'Cerrar contorno',exact:true}).click();
    const margin=page.locator('form[data-action="margin"]');
    await margin.locator('input').fill('1');await margin.getByRole('button').click();
    await page.waitForFunction(()=>!document.body.textContent?.includes('Calculando margen'),{},{timeout:20000});
    expect(await page.getByText('Falta nombre',{exact:true}).isVisible()).toBe(true);
    await page.getByRole('button',{name:'Guardar',exact:true}).click();
    await expect.poll(async()=>{try{return JSON.parse(await readFile(file,'utf8')).pieces.length;}catch{return 0;}}).toBe(1);
    const saved=JSON.parse(await readFile(file,'utf8'));
    await page.getByRole('button',{name:'Nuevo documento',exact:true}).click();
    await page.getByRole('button',{name:'Abrir archivo',exact:true}).click();
    await page.getByLabel('Pieza',{exact:true}).selectOption(saved.pieces[0].id);
    await page.locator('summary').filter({hasText:'Puntos, curvas y transformaciones'}).click();
    const point=page.locator('form[data-action="point"]');
    await point.locator('[name="index"]').fill('0');
    await point.locator('[name="x"]').fill('270.234567890123');
    await point.locator('[name="y"]').fill('57.123456789');
    await point.getByRole('button').click();
    expect(await page.getByRole('status').textContent()).toContain('Calculando');
    // A timer on the renderer must keep advancing during the algebraic job.
    const ticks=await page.evaluate(async()=>{let ticks=0;const timer=setInterval(()=>ticks++,10);await new Promise(r=>setTimeout(r,200));clearInterval(timer);return ticks;});
    expect(ticks).toBeGreaterThan(5);
    await page.getByRole('button',{name:'Deshacer',exact:true}).click({timeout:2000});
    await page.waitForFunction(()=>!document.body.textContent?.includes('Calculando margen'),{},{timeout:20000});
    expect(await page.getByText('Falta nombre',{exact:true}).isVisible()).toBe(true);
    const snapshot=JSON.parse((await page.getByTestId('cad-snapshot').textContent())!);
    expect(snapshot.pieces[0].contour.points[0]).toMatchObject({x:280,y:80});
    expect(await page.getByTestId('cad-error').textContent()).toBe('');
    const properties=page.locator('form[data-action="properties"]');
    await properties.locator('[name=name]').fill('Nombre sin aplicar');
    await properties.locator('[name=grainline]').check();
    await properties.locator('[name=gx1]').fill('');
    await properties.getByRole('button').click();
    expect(await properties.getByRole('alert').textContent()).toContain('No se aplicaron los datos. Completa Hilo inicio X.');
    expect(await properties.getByRole('status').textContent()).toContain('Cambios sin aplicar');
    expect(JSON.parse((await page.getByTestId('cad-snapshot').textContent())!).pieces[0].name).toBe('');
    await properties.locator('[name=grainline]').uncheck();
    await properties.locator('[name=name]').fill('');await properties.getByRole('button').click();
    expect(await page.getByText('Falta nombre',{exact:true}).isVisible()).toBe(true);
    expect(await page.getByText('Falta una línea de hilo válida',{exact:true}).isVisible()).toBe(true);
    expect(await properties.getByRole('alert').count()).toBe(0);
  } finally {
    await app.evaluate(({dialog})=>{Object.defineProperty(dialog,'showMessageBoxSync',{configurable:true,value:()=>1});});
    await app.close();
  }
},60000);
