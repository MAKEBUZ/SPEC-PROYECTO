import {it,expect} from 'vitest';
import {_electron} from '@playwright/test';
import {mkdtemp,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';

it('keeps workspace navigation, themes and tools usable across window sizes',async()=>{
 const env=Object.fromEntries(Object.entries(process.env).filter((p):p is [string,string]=>p[1]!==undefined));delete env.ELECTRON_RUN_AS_NODE;
 const dir=await mkdtemp(join(tmpdir(),'patron-design-'));
 const app=await _electron.launch({executablePath:resolve('node_modules/electron/dist/electron.exe'),args:[resolve('dist/tests/desktop/cad-host.js'),`--user-data-dir=${dir}`],env});
 try{
  const capture=async(path:string)=>{const encoded=await app.evaluate(async({BrowserWindow})=>(await BrowserWindow.getAllWindows()[0]!.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG().toString('base64'));await writeFile(path,Buffer.from(encoded,'base64'));};
  const page=await app.firstWindow();await page.setViewportSize({width:1440,height:1000});
  await page.getByRole('button',{name:'Abrir CAD',exact:true}).click();
  const draw=page.locator('form[data-action="draw"]');const advanced=page.locator('details').filter({has:page.locator('form[data-action=draw]')});if(!await advanced.evaluate(e=>e.hasAttribute('open')))await advanced.locator(':scope > summary').click();await draw.locator('textarea').fill('50,50\n300,50\n260,250\n50,220');await draw.getByRole('button').click();
  await page.getByRole('button',{name:'Cerrar contorno',exact:true}).click();
  await mkdir('.local/design-preview',{recursive:true});
  await capture('.local/design-preview/cad-light.png');
  await page.getByRole('button',{name:'Modo oscuro',exact:true}).click();
  expect(await page.locator('html').getAttribute('data-theme')).toBe('dark');
  expect(await page.getByLabel('Editor del patrón').evaluate(e=>getComputedStyle(e).backgroundColor)).toBe('rgb(248, 250, 252)');
  await page.screenshot({path:'.local/design-preview/cad-dark.png'});
  await page.locator('summary').filter({hasText:'Puntos, curvas y transformaciones'}).click();
  expect(await page.locator('form[data-action="move"]').isVisible()).toBe(true);
  await page.getByRole('button',{name:'Preparar impresión',exact:true}).click();
  expect(await page.locator('.flow-guide').isVisible()).toBe(true);
  const create=page.locator('form[data-action="preparation-create"]');await create.locator('[name=name]').fill('Prueba visual A4');await create.locator('[type=checkbox]').check();await create.getByRole('button').click();
  expect(await page.locator('.export-summary').textContent()).toContain('Prueba visual A4');
  await page.screenshot({path:'.local/design-preview/print-dark.png'});
  await page.setViewportSize({width:800,height:800});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.getByRole('button',{name:'Abrir CAD',exact:true}).click();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await capture('.local/design-preview/cad-compact.png');
  await page.getByRole('button',{name:'Cuenta',exact:true}).click();
  await page.screenshot({path:'.local/design-preview/account-dark.png'});
  // Reload checks persisted appearance; this isolated fixture has no user documents.
  await page.getByRole('button',{name:'Abrir CAD',exact:true}).click();await app.evaluate(({dialog})=>{Object.defineProperty(dialog,'showMessageBoxSync',{configurable:true,value:()=>1});});await page.getByRole('button',{name:'Nuevo documento',exact:true}).click();await page.reload();await page.getByRole('button',{name:'Modo oscuro',exact:true}).waitFor();
  expect(await page.locator('html').getAttribute('data-theme')).toBe('dark');
 }finally{await app.evaluate(({dialog})=>{Object.defineProperty(dialog,'showMessageBoxSync',{configurable:true,value:()=>1});});await app.close();}
},60000);
