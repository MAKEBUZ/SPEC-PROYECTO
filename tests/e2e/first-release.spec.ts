import {verifyPublishedJourney} from '../support/first-release-web.js';
import {beforeAll,afterAll,it,expect,vi} from 'vitest';
import {_electron,expect as ui,type ElectronApplication} from '@playwright/test';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {readFile,mkdir,writeFile,readdir} from 'node:fs/promises';

import {spawnSync} from 'node:child_process';
import {startAccountHost,type AccountHost,PASSWORD} from '../support/account-host.js';
import {pdfFixture} from '../support/pdf-fixture.js';
let host:AccountHost;
beforeAll(async()=>{host=await startAccountHost();},30000);afterAll(async()=>{await host?.close();});
async function launch(run:string){const env:Record<string,string>={};for(const[k,v]of Object.entries(process.env))if(v!==undefined&&k!=='ELECTRON_RUN_AS_NODE')env[k]=v;env.PATRON_E2E_API=host.testBaseUrl;env.PATRON_E2E_RUN=run;return _electron.launch({executablePath:resolve('node_modules/electron/dist/electron.exe'),args:[resolve('dist/tests/desktop/publication-e2e-main.js')],env,timeout:30000});}
async function stop(cad:ElectronApplication){const pid=cad.process().pid;if(pid)spawnSync('taskkill',['/PID',String(pid),'/T','/F'],{windowsHide:true,timeout:10000,stdio:'ignore'});}
it('T095 follows one saved revision through CAD, PDF, publication, mobile portal, download and trash recovery',async()=>{
 const a=await host.verifiedAccount(),run=randomUUID(),directory=resolve('.local','publication-e2e',run),source=resolve(directory,'documento.patron'),pdfPath=resolve(directory,'impresion.pdf'),{document,preparation}=pdfFixture();
 await mkdir(directory,{recursive:true});await writeFile(source,JSON.stringify(document));let cad=await launch(run);
 try{
  await cad.evaluate(({dialog},{source,pdfPath})=>{Object.defineProperty(dialog,'showSaveDialog',{configurable:true,value:async(_window:unknown,options:{filters:{extensions:string[]}[]})=>({canceled:false,filePath:options.filters[0]!.extensions.includes('pdf')?pdfPath:source})});},{source,pdfPath});
  let page=await cad.firstWindow();const login=page.locator('form').filter({has:page.getByRole('heading',{name:'Iniciar sesión',exact:true})});await login.locator('input[name=email]').fill(a.email);await login.locator('input[name=password]').fill(PASSWORD);await login.getByRole('button',{name:'Iniciar sesión',exact:true}).click();await ui(page.getByRole('heading',{name:'Perfil',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Abrir archivo',exact:true}).click();await ui(page.getByTestId('cad-snapshot')).toBeAttached();await page.getByRole('button',{name:'Guardar',exact:true}).click();await ui.poll(async()=>{try{return (await readdir(resolve(directory,'document-writes'))).filter(name=>name.endsWith('.previous.patron')).length;}catch{return 0;}}).toBeGreaterThan(0);await page.getByRole('button',{name:'Preparar impresión',exact:true}).click();await page.getByLabel('Preparación guardada').selectOption(preparation.id);await page.getByRole('button',{name:'Generar PDF',exact:true}).click();await ui(page.getByText('PDF guardado: impresion.pdf',{exact:true})).toBeVisible({timeout:15000});
  await page.getByRole('button',{name:'Publicación',exact:true}).click();await page.getByRole('button',{name:'Actualizar PDF disponibles',exact:true}).click();const choices=page.getByRole('region',{name:'PDF opcionales'});await ui(choices.getByRole('checkbox')).toHaveCount(1);await choices.getByRole('checkbox').check();
  await page.getByLabel('Nombre del nuevo proyecto').fill('Proyecto con PDF');await page.getByRole('button',{name:'Crear proyecto',exact:true}).click();await ui(page.getByLabel('Proyecto',{exact:true})).not.toHaveValue('');await page.getByLabel('Nombre del patrón').fill('Patrón con PDF');
  await page.getByRole('button',{name:'Preparar editable y vista previa y PDF seleccionados',exact:true}).click();await ui(page.getByRole('region',{name:'Archivos preparados'}).getByRole('listitem')).toHaveCount(3);
  const put=host.blobs.putStream.bind(host.blobs),fault=vi.spyOn(host.blobs,'putStream').mockImplementationOnce(async(...args)=>{await put(...args);throw Error('Injected interrupted upload');});
  await page.getByRole('button',{name:'Publicar versión',exact:true}).click();await ui(page.getByText('Carga interrumpida: puedes continuar con la misma revisión guardada',{exact:true})).toBeVisible();fault.mockRestore();
  await stop(cad);cad=await launch(run);page=await cad.firstWindow();await ui(page.getByRole('button',{name:'Abrir archivo',exact:true})).toBeEnabled();await page.getByRole('button',{name:'Abrir archivo',exact:true}).click();await page.getByRole('button',{name:'Publicación',exact:true}).click();await page.getByRole('button',{name:'Continuar carga',exact:true}).click();await host.finishPublications();await ui(page.getByText('Versión publicada',{exact:true})).toBeVisible({timeout:25000});
  const rows=(await host.pool.query("SELECT f.* FROM stored_files f JOIN versions v ON v.id=f.version_id JOIN patterns p ON p.id=v.pattern_id WHERE p.owner_id=$1 AND f.role='pdf'",[a.accountId])).rows;expect(rows).toHaveLength(1);expect(rows[0].local_revision_id).toBe(document.revisionId);await verifyPublishedJourney(host,a.email,pdfPath,source);expect(Buffer.from(await host.blobs.get(rows[0].private_key))).toEqual(await readFile(pdfPath));
  await stop(cad);cad=await launch(run);page=await cad.firstWindow();await ui(page.getByRole('button',{name:'Abrir archivo',exact:true})).toBeEnabled();await page.getByRole('button',{name:'Abrir archivo',exact:true}).click();await page.getByRole('button',{name:'Publicación',exact:true}).click();await page.getByRole('button',{name:'Actualizar PDF disponibles',exact:true}).click();await ui(page.getByRole('region',{name:'PDF opcionales'}).getByRole('checkbox')).toHaveCount(1);
 }finally{vi.restoreAllMocks();await stop(cad);}
},120000);
