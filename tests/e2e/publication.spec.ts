import {beforeAll,afterAll,it,expect,vi} from 'vitest';
import {_electron,expect as ui,type ElectronApplication} from '@playwright/test';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {readFile,mkdir,writeFile,readdir} from 'node:fs/promises';
import {publishedFixture,publishRevision} from '../support/publication-fixture.js';
import {spawnSync} from 'node:child_process';
import {startAccountHost,type AccountHost,PASSWORD} from '../support/account-host.js';
import {pdfFixture} from '../support/pdf-fixture.js';
let host:AccountHost;
beforeAll(async()=>{host=await startAccountHost();},30000);afterAll(async()=>{await host?.close();});
async function launch(run:string){const env:Record<string,string>={};for(const[k,v]of Object.entries(process.env))if(v!==undefined&&k!=='ELECTRON_RUN_AS_NODE')env[k]=v;env.PATRON_E2E_API=host.testBaseUrl;env.PATRON_E2E_RUN=run;return _electron.launch({executablePath:resolve('node_modules/electron/dist/electron.exe'),args:[resolve('dist/tests/desktop/publication-e2e-main.js')],env,timeout:30000});}
async function stop(cad:ElectronApplication){const pid=cad.process().pid;if(pid)spawnSync('taskkill',['/PID',String(pid),'/T','/F'],{windowsHide:true,timeout:10000,stdio:'ignore'});}
it('exports, selects and publishes a PDF of the saved revision, preserving the catalog after restart',async()=>{
 const a=await host.verifiedAccount(),run=randomUUID(),directory=resolve('.local','publication-e2e',run),source=resolve(directory,'documento.patron'),pdfPath=resolve(directory,'impresion.pdf'),{document,preparation}=pdfFixture();
 await mkdir(directory,{recursive:true});await writeFile(source,JSON.stringify(document));let cad=await launch(run);
 try{
  await cad.evaluate(({dialog},{source,pdfPath})=>{Object.defineProperty(dialog,'showSaveDialog',{configurable:true,value:async(_window:unknown,options:{filters:{extensions:string[]}[]})=>({canceled:false,filePath:options.filters[0]!.extensions.includes('pdf')?pdfPath:source})});},{source,pdfPath});
  let page=await cad.firstWindow();const login=page.locator('form').filter({has:page.getByRole('heading',{name:'Iniciar sesión',exact:true})});await login.locator('input[name=email]').fill(a.email);await login.locator('input[name=password]').fill(PASSWORD);await login.getByRole('button',{name:'Iniciar sesión',exact:true}).click();await ui(page.getByRole('heading',{name:'Perfil',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Abrir archivo',exact:true}).click();await ui(page.getByTestId('cad-snapshot')).toBeAttached();await page.getByRole('button',{name:'Preparar impresión',exact:true}).click();await page.getByLabel('Preparación guardada').selectOption(preparation.id);await page.getByRole('button',{name:'Generar PDF',exact:true}).click();await ui(page.getByText('PDF guardado: impresion.pdf',{exact:true})).toBeVisible({timeout:15000});
  await page.getByRole('button',{name:'Publicación',exact:true}).click();await page.getByRole('button',{name:'Actualizar PDF disponibles',exact:true}).click();const choices=page.getByRole('region',{name:'PDF opcionales'});await ui(choices.getByRole('checkbox')).toHaveCount(1);await choices.getByRole('checkbox').check();
  await page.getByLabel('Nombre del nuevo proyecto').fill('Proyecto con PDF');await page.getByRole('button',{name:'Crear proyecto',exact:true}).click();await ui(page.getByLabel('Proyecto',{exact:true})).not.toHaveValue('');await page.getByLabel('Nombre del patrón').fill('Patrón con PDF');
  await page.getByRole('button',{name:'Preparar editable y vista previa y PDF seleccionados',exact:true}).click();await ui(page.getByRole('region',{name:'Archivos preparados'}).getByRole('listitem')).toHaveCount(3);
  const put=host.blobs.putStream.bind(host.blobs),fault=vi.spyOn(host.blobs,'putStream').mockImplementationOnce(async(...args)=>{await put(...args);throw Error('Injected interrupted upload');});
  await page.getByRole('button',{name:'Publicar versión',exact:true}).click();await ui(page.getByText('Carga interrumpida: puedes continuar con la misma revisión guardada',{exact:true})).toBeVisible();fault.mockRestore();
  await stop(cad);cad=await launch(run);page=await cad.firstWindow();await ui(page.getByRole('button',{name:'Abrir archivo',exact:true})).toBeEnabled();await page.getByRole('button',{name:'Abrir archivo',exact:true}).click();await page.getByRole('button',{name:'Publicación',exact:true}).click();await page.getByRole('button',{name:'Continuar carga',exact:true}).click();await host.finishPublications();await ui(page.getByText('Versión publicada',{exact:true})).toBeVisible({timeout:25000});
  const rows=(await host.pool.query("SELECT f.* FROM stored_files f JOIN versions v ON v.id=f.version_id JOIN patterns p ON p.id=v.pattern_id WHERE p.owner_id=$1 AND f.role='pdf'",[a.accountId])).rows;expect(rows).toHaveLength(1);expect(rows[0].local_revision_id).toBe(document.revisionId);expect(Buffer.from(await host.blobs.get(rows[0].private_key))).toEqual(await readFile(pdfPath));
  await stop(cad);cad=await launch(run);page=await cad.firstWindow();await ui(page.getByRole('button',{name:'Abrir archivo',exact:true})).toBeEnabled();await page.getByRole('button',{name:'Abrir archivo',exact:true}).click();await page.getByRole('button',{name:'Publicación',exact:true}).click();await page.getByRole('button',{name:'Actualizar PDF disponibles',exact:true}).click();await ui(page.getByRole('region',{name:'PDF opcionales'}).getByRole('checkbox')).toHaveCount(1);
 }finally{vi.restoreAllMocks();await stop(cad);}
},60000);
it('selects a project, publishes saved bytes through IPC and recovers the binding after restarting the CAD',async()=>{
 const a=await host.verifiedAccount(),run=randomUUID();let cad=await launch(run);
 try{
  let page=await cad.firstWindow();const login=page.locator('form').filter({has:page.getByRole('heading',{name:'Iniciar sesión',exact:true})});await login.locator('input[name=email]').fill(a.email);await login.locator('input[name=password]').fill(PASSWORD);await login.getByRole('button',{name:'Iniciar sesión',exact:true}).click();await ui(page.getByRole('heading',{name:'Perfil',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Guardar',exact:true}).click();await page.getByRole('button',{name:'Publicación',exact:true}).click();
  await page.getByLabel('Nombre del nuevo proyecto').fill('Proyecto E2E');await page.getByRole('button',{name:'Crear proyecto',exact:true}).click();
  await ui(page.getByLabel('Proyecto',{exact:true})).not.toHaveValue('');await page.getByLabel('Nombre del patrón').fill('Patrón E2E');
  await page.getByRole('button',{name:'Preparar editable y vista previa'}).click();await ui(page.getByRole('region',{name:'Archivos preparados'})).toBeVisible();
  await page.getByRole('button',{name:'Publicar versión',exact:true}).click();await host.finishPublications();
  await ui(page.getByText('Versión publicada',{exact:true})).toBeVisible({timeout:25000});
  const stored=JSON.parse(await readFile(resolve('.local','publication-e2e',run,'documento.patron'),'utf8'));
  const version=(await host.pool.query('SELECT v.* FROM versions v JOIN patterns p ON p.id=v.pattern_id WHERE p.owner_id=$1',[a.accountId])).rows[0];expect(version.local_revision_id).toBe(stored.revisionId);
  await stop(cad);cad=await launch(run);page=await cad.firstWindow();await ui(page.getByRole('button',{name:'Abrir archivo',exact:true})).toBeEnabled();await page.getByRole('button',{name:'Abrir archivo',exact:true}).click();await page.getByRole('button',{name:'Publicación',exact:true}).click();
  await ui(page.getByText('Versión publicada',{exact:true})).toBeVisible();await ui(page.getByText(new RegExp(version.id))).toBeVisible();
  expect((await host.pool.query('SELECT count(*) FROM versions v JOIN patterns p ON p.id=v.pattern_id WHERE p.owner_id=$1',[a.accountId])).rows[0].count).toBe('1');
  await page.getByRole('button',{name:'Guardar documento',exact:true}).click();await ui.poll(async()=>JSON.parse(await readFile(resolve('.local','publication-e2e',run,'documento.patron'),'utf8')).remoteBinding?.lastPublishedVersion).toBe(version.id);
 }finally{await stop(cad);}
},60000);

it.each(['independent','remote','deleted'] as const)('resolves %s through the CAD without overwriting the original file or publishing',async choice=>{
 const a=await host.verifiedAccount(),first=await publishedFixture(host,a.session),run=randomUUID(),directory=resolve('.local','publication-e2e',run);
 const local=JSON.parse(first.editable.toString());local.remoteBinding={accountId:a.accountId,patternId:first.patternId,lastPublishedVersion:first.versionId};
 const next=structuredClone(local);next.preparations=[{id:randomUUID(),name:'Preparación remota',selection:[],transforms:{},mode:'large',paper:'A4',margin:10}];
 await publishRevision(host,a.session,next,{projectId:first.projectId,patternId:first.patternId,versionId:first.versionId});
 if(choice==='deleted'){
  const removed=randomUUID();local.remoteBinding.patternId=removed;
  // Consume an authoritative completed purge fixture; this does not exercise
  // the separate purge worker implementation.
  await host.pool.query("INSERT INTO purge_jobs(id,owner_id,operation_id,root_kind,root_id,scope_revision,member_ids,object_keys,state,suppression_id,completed_at) VALUES($1,$2,$3,'pattern',$4,'test',$5,'{}','complete',$6,clock_timestamp())",[randomUUID(),a.accountId,randomUUID(),removed,[removed],randomUUID()]);
 }
 await mkdir(directory,{recursive:true});const original=JSON.stringify(local);await writeFile(resolve(directory,'documento.patron'),original);
 const cad=await launch(run);try{
  const page=await cad.firstWindow(),login=page.locator('form').filter({has:page.getByRole('heading',{name:'Iniciar sesión',exact:true})});
  await login.locator('input[name=email]').fill(a.email);await login.locator('input[name=password]').fill(PASSWORD);await login.getByRole('button',{name:'Iniciar sesión',exact:true}).click();await ui(page.getByRole('heading',{name:'Perfil',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Abrir archivo',exact:true}).click();await page.getByRole('button',{name:'Publicación',exact:true}).click();
  await page.getByRole('button',{name:'Revisar conflicto de publicación',exact:true}).click();
  const action=page.getByRole('button',{name:choice==='remote'?'Cargar versión remota con respaldo':choice==='deleted'?'Publicar como patrón nuevo':'Conservar como patrón independiente',exact:true});await ui(action).toBeDisabled();
  await page.getByRole('checkbox',{name:choice==='deleted'?/Confirmo crear una copia/:/Confirmo la opción/}).check();await action.click();
  try{await ui(page.getByRole('status').filter({hasText:choice==='remote'?'Versión remota cargada como copia de trabajo':'Copia independiente preparada'})).toBeVisible();}catch(error){throw new Error(`${String(error)}\nCAD: ${await page.locator('body').innerText()}`);}
  expect(await readFile(resolve(directory,'documento.patron'),'utf8')).toBe(original);
  if(choice==='remote'){
   const backups=await readdir(resolve(directory,'publication-conflict-backups'));expect(backups).toHaveLength(1);
   const backup=JSON.parse(await readFile(resolve(directory,'publication-conflict-backups',backups[0]!),'utf8'));expect(backup.documentId).toBe(local.documentId);expect(backup.preparations).toEqual(local.preparations);
  }
  const copyPath=resolve(directory,'copia.patron');await cad.evaluate(({dialog},path)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:path});},copyPath);
  await page.getByRole('button',{name:'Guardar documento',exact:true}).click();
  await ui.poll(async()=>{try{return JSON.parse(await readFile(copyPath,'utf8')).documentId;}catch{return local.documentId;}}).not.toBe(local.documentId);
  const copy=JSON.parse(await readFile(copyPath,'utf8'));expect(copy.preparations).toEqual(choice==='remote'?next.preparations:local.preparations);
  if(choice==='remote')expect(copy.remoteBinding.patternId).toBe(first.patternId);else expect(copy.remoteBinding).toBeUndefined();
  expect(await readFile(resolve(directory,'documento.patron'),'utf8')).toBe(original);
  expect((await host.pool.query('SELECT count(*) FROM versions WHERE pattern_id=$1',[first.patternId])).rows[0].count).toBe('2');
 }finally{await stop(cad);}
},60000);
