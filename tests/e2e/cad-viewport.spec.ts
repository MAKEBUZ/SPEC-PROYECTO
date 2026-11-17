import {it,expect} from 'vitest';
import {_electron,expect as ui} from '@playwright/test';
import {mkdtemp,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';

it('centers, pans and zooms the view without changing geometry or unapplied properties',async()=>{
 const env=Object.fromEntries(Object.entries(process.env).filter((p):p is [string,string]=>p[1]!==undefined));delete env.ELECTRON_RUN_AS_NODE;
 const dir=await mkdtemp(join(tmpdir(),'patron-viewport-'));
 const app=await _electron.launch({executablePath:resolve('node_modules/electron/dist/electron.exe'),args:[resolve('dist/tests/desktop/cad-host.js'),`--user-data-dir=${dir}`],env});
 try{
  const page=await app.firstWindow();await page.setViewportSize({width:1360,height:900});
  await page.getByRole('button',{name:'Abrir CAD',exact:true}).click();
  const empty=page.getByLabel('Editor del patrón');const eb=(await empty.boundingBox())!;await page.mouse.move(eb.x+eb.width/2,eb.y+eb.height/2);await page.mouse.down();await page.mouse.move(eb.x+eb.width/2+40,eb.y+eb.height/2+20);await page.mouse.up();expect(Number(await empty.getAttribute('data-center-x'))).toBeLessThan(0);
  const draw=page.locator('form[data-action=draw]');const advanced=page.locator('details').filter({has:page.locator('form[data-action=draw]')});if(!await advanced.evaluate(e=>e.hasAttribute('open')))await advanced.locator(':scope > summary').click();await draw.locator('textarea').fill('1000,1000\n1200,1000\n1200,1100\n1000,1100');await draw.getByRole('button').click();
  const canvas=page.getByLabel('Editor del patrón');await ui(canvas).toHaveAttribute('data-center-x','1100');await ui(canvas).toHaveAttribute('data-center-y','1050');
  const before=await page.getByTestId('cad-snapshot').textContent();
  const name=page.locator('form[data-action=properties] [name=name]');await name.fill('Todavía sin aplicar');
  await page.getByRole('button',{name:'Mover vista',exact:true}).click();await canvas.scrollIntoViewIfNeeded();let b=(await canvas.boundingBox())!;
  await page.mouse.move(b.x+b.width/2,b.y+b.height/2);await page.mouse.down();await page.mouse.move(b.x+b.width/2+70,b.y+b.height/2+40,{steps:4});await page.mouse.up();
  expect(Number(await canvas.getAttribute('data-center-x'))).toBeLessThan(1100);
  expect(await page.getByTestId('cad-snapshot').textContent()).toBe(before);await ui(name).toHaveValue('Todavía sin aplicar');
  await page.getByRole('button',{name:'Centrar piezas',exact:true}).click();await ui(canvas).toHaveAttribute('data-center-x','1100');
  await page.getByRole('button',{name:'Alejar vista',exact:true}).click();expect(Number(await canvas.getAttribute('data-zoom'))).toBeCloseTo(2.8);
  await page.setViewportSize({width:800,height:800});await page.getByRole('button',{name:'Editar puntos',exact:true}).click();await canvas.scrollIntoViewIfNeeded();b=(await canvas.boundingBox())!;
  const z=Number(await canvas.getAttribute('data-zoom'));
  const point=(x:number,y:number)=>({x:b.x+((x-1100)*z+400)*b.width/800,y:b.y+((y-1050)*z+250)*b.height/500});
  const from=point(1000,1000),to=point(1010,1015);await page.mouse.move(from.x,from.y);await page.mouse.down();await page.mouse.move(to.x,to.y);await page.mouse.up();
  const snapshot=JSON.parse((await page.getByTestId('cad-snapshot').textContent())!);expect(snapshot.pieces[0].contour.points[0].x).toBeCloseTo(1010,0);expect(snapshot.pieces[0].contour.points[0].y).toBeCloseTo(1015,0);
  await mkdir('.local/design-preview',{recursive:true});
  const capture=async(path:string)=>{const data=await app.evaluate(async({BrowserWindow})=>(await BrowserWindow.getAllWindows()[0]!.capturePage(undefined,{stayHidden:true})).toPNG().toString('base64'));await writeFile(path,Buffer.from(data,'base64'));};
  await capture('.local/design-preview/viewport-v016.png');
  await page.setViewportSize({width:1360,height:900});await page.getByRole('button',{name:'Cuenta',exact:true}).click();
  const nav=page.getByRole('navigation',{name:'Opciones de acceso'});
  await ui(page.getByRole('heading',{name:'Iniciar sesión',exact:true})).toBeVisible();expect(await page.getByRole('heading',{name:'Crear cuenta',exact:true}).count()).toBe(0);
  await nav.getByRole('button',{name:'Crear cuenta',exact:true}).click();await ui(page.getByRole('heading',{name:'Crear cuenta',exact:true})).toBeVisible();expect(await page.getByRole('heading',{name:'Iniciar sesión',exact:true}).count()).toBe(0);
  await nav.getByRole('button',{name:'Recuperar acceso'}).click();await ui(page.getByRole('heading',{name:'Solicitar restablecimiento'})).toBeVisible();
  await nav.getByRole('button',{name:'Verificar correo'}).click();await ui(page.getByRole('heading',{name:'Verificar correo'})).toBeVisible();
  await nav.getByRole('button',{name:'Iniciar sesión',exact:true}).click();await capture('.local/design-preview/account-v016.png');
 }finally{await app.evaluate(({dialog})=>{Object.defineProperty(dialog,'showMessageBoxSync',{configurable:true,value:()=>1});});await app.close();}
},60000);
