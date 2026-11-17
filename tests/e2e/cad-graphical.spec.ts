import {it,expect} from 'vitest';
import {_electron,expect as ui} from '@playwright/test';
import {mkdtemp,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';

it('draws by clicks and context menu, supports shortcuts, wheel, handles and corner selection',async()=>{
 const env=Object.fromEntries(Object.entries(process.env).filter((p):p is [string,string]=>p[1]!==undefined));delete env.ELECTRON_RUN_AS_NODE;
 const dir=await mkdtemp(join(tmpdir(),'patron-graphical-'));
 const app=await _electron.launch({executablePath:resolve('node_modules/electron/dist/electron.exe'),args:[resolve('dist/tests/desktop/cad-host.js'),`--user-data-dir=${dir}`],env});
 try{
  const page=await app.firstWindow();page.setDefaultTimeout(10000);await page.emulateMedia({reducedMotion:'reduce'});await page.setViewportSize({width:1440,height:1000});
  await page.getByRole('button',{name:'Abrir CAD',exact:true}).click();
  const canvas=page.getByLabel('Editor del patrón');
  const snapshot=async()=>JSON.parse((await page.getByTestId('cad-snapshot').textContent())!);
  const screen=async(x:number,y:number)=>{await canvas.scrollIntoViewIfNeeded();const b=(await canvas.boundingBox())!,z=Number(await canvas.getAttribute('data-zoom')),cx=Number(await canvas.getAttribute('data-center-x')),cy=Number(await canvas.getAttribute('data-center-y'));return {x:b.x+((x-cx)*z+400)*b.width/800,y:b.y+((y-cy)*z+250)*b.height/500};};
  const click=async(x:number,y:number,button:'left'|'right'='left')=>{const p=await screen(x,y);await page.mouse.click(p.x,p.y,{button});};
  const key=async(value:string)=>{await canvas.focus();await page.keyboard.press(value);};
  await key('p');await ui(canvas).toHaveAttribute('data-mode','draw');
  for(const [x,y] of [[-100,-80],[120,-80],[120,100],[-100,100]])await click(x!,y!);
  expect((await snapshot()).pieces[0].contour.points).toHaveLength(4);
  await app.evaluate(({Menu})=>{const state=globalThis as typeof globalThis & {menuUndo:number};state.menuUndo=0;Menu.setApplicationMenu(Menu.buildFromTemplate([{label:'Edición',submenu:[{label:'Deshacer nativo de ensayo',accelerator:'Control+Z',click:()=>{state.menuUndo++;}}]}]));});
  await key('Control+z');expect((await snapshot()).pieces[0].contour.points).toHaveLength(3);expect(await app.evaluate(()=> (globalThis as typeof globalThis & {menuUndo:number}).menuUndo)).toBe(0);
  await key('Control+Shift+z');expect((await snapshot()).pieces[0].contour.points).toHaveLength(4);
  await click(-100,-80);await ui(canvas).toHaveAttribute('data-mode','edit');expect((await snapshot()).pieces[0].contour.segments).toHaveLength(4);
  await key('Control+z');expect((await snapshot()).pieces[0].contour.segments).toHaveLength(3);await key('Control+y');
  const before=(await snapshot()).pieces;
  const name=page.locator('form[data-action=properties] [name=name]');await name.fill('Texto sin aplicar');await name.press('Control+z');expect((await snapshot()).pieces).toEqual(before);
  await click(0,100,'right');await page.getByRole('menuitem',{name:'Insertar punto en el tramo',exact:true}).click();expect((await snapshot()).pieces[0].contour.points).toHaveLength(5);await key('Control+z');
  await page.getByRole('button',{name:'Curvar tramo',exact:true}).click();await click(10,-80);
  let piece=(await snapshot()).pieces[0];expect(piece.contour.segments[0].kind).toBe('cubic');
  const h=piece.contour.segments[0].handleStart,from=await screen(h.x,h.y),to=await screen(h.x,h.y-20);
  await page.mouse.move(from.x,from.y);await page.mouse.down();await page.mouse.move(to.x,to.y,{steps:3});expect((await snapshot()).pieces[0].contour.segments[0].handleStart).toEqual(h);await page.keyboard.press('Escape');await page.mouse.up();expect((await snapshot()).pieces[0].contour.segments[0].handleStart).toEqual(h);await page.mouse.move(from.x,from.y);await page.mouse.down();await page.mouse.move(to.x,to.y,{steps:3});await page.mouse.up();
  expect((await snapshot()).pieces[0].contour.segments[0].handleStart.y).toBeCloseTo(h.y-20,0);await key('Control+z');expect((await snapshot()).pieces[0].contour.segments[0].handleStart).toEqual(h);await key('Control+y');
  await page.getByRole('button',{name:'Redondear esquina',exact:true}).click();const margin=page.locator('form[data-action=quick-margin]');await margin.locator('[name=width]').fill('1');await margin.getByRole('button').click();await click(120,100);
  piece=(await snapshot()).pieces[0];expect(piece.cornerJoins[piece.contour.points[2].id]).toBe('round');expect(piece.seamWidth).toBe(1);
  await page.getByRole('button',{name:'Editar puntos',exact:true}).click();
  const cursor=await screen(0,0);await page.mouse.move(cursor.x,cursor.y);const oldZoom=Number(await canvas.getAttribute('data-zoom')),scroll=await page.evaluate(()=>scrollY);await page.mouse.wheel(0,-120);await expect.poll(async()=>Number(await canvas.getAttribute('data-zoom'))).toBeGreaterThan(oldZoom);
  const afterCursor=await screen(0,0);expect(afterCursor.x).toBeCloseTo(cursor.x,0);expect(afterCursor.y).toBeCloseTo(cursor.y,0);expect(await page.evaluate(()=>scrollY)).toBe(scroll);
  await click(-160,140,'right');await page.getByRole('menuitem',{name:'Añadir punto aquí'}).click();expect((await snapshot()).pieces).toHaveLength(2);
  await page.getByLabel('Próximo tramo',{exact:true}).selectOption('cubic');await click(-100,160,'right');await page.getByRole('menuitem',{name:'Añadir punto aquí'}).click();expect((await snapshot()).pieces[1].contour.points).toHaveLength(2);expect((await snapshot()).pieces[1].contour.segments[0].kind).toBe('cubic');await key('Escape');
  const savedPieces=(await snapshot()).pieces,file=join(dir,'grafico.patron');await app.evaluate(({dialog},file)=>{Object.defineProperty(dialog,'showSaveDialog',{configurable:true,value:async()=>({canceled:false,filePath:file})});Object.defineProperty(dialog,'showOpenDialog',{configurable:true,value:async()=>({canceled:false,filePaths:[file]})});},file);
  await page.getByRole('button',{name:'Guardar',exact:true}).click();await ui(page.getByRole('button',{name:'Guardar',exact:true})).toBeEnabled();await page.getByRole('button',{name:'Nuevo documento',exact:true}).click();await page.getByRole('button',{name:'Abrir archivo',exact:true}).click();await expect.poll(async()=>(await snapshot()).pieces.length).toBe(2);expect((await snapshot()).pieces).toEqual(savedPieces);
  await page.getByLabel('Pieza',{exact:true}).selectOption(savedPieces[0].id);await page.getByRole('button',{name:'Modo oscuro',exact:true}).click();await mkdir('.local/design-preview',{recursive:true});await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:'.local/design-preview/graphical-v017.png'});
 }finally{await app.evaluate(({dialog})=>{Object.defineProperty(dialog,'showMessageBoxSync',{configurable:true,value:()=>1});});await app.close();}
},60000);
