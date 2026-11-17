import {beforeAll,afterAll,it,expect} from 'vitest';
import {_electron,expect as ui,type ElectronApplication} from '@playwright/test';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {startAccountHost,type AccountHost,PASSWORD} from '../support/account-host.js';
let host:AccountHost;
beforeAll(async()=>{host=await startAccountHost();},30000);
afterAll(async()=>{await host?.close();});
async function launch(run:string,drop=false){
 const env:Record<string,string>={};for(const [k,v] of Object.entries(process.env))if(v!==undefined&&k!=='ELECTRON_RUN_AS_NODE')env[k]=v;
 Object.assign(env,{PATRON_E2E_API:host.testBaseUrl,PATRON_E2E_RUN:run,PATRON_E2E_DROP_COMMIT:drop?'1':'0'});
 return _electron.launch({executablePath:resolve('node_modules/electron/dist/electron.exe'),args:[resolve('dist/tests/desktop/publication-e2e-main.js')],env,timeout:30000});
}
function stop(cad:ElectronApplication){const pid=cad.process().pid;if(pid)spawnSync('taskkill',['/PID',String(pid),'/T','/F'],{windowsHide:true,timeout:10000,stdio:'ignore'});}
it('FR-009 FR-010: saves locally, loses the commit response and reconciles after reopening without a second version',async()=>{
 const a=await host.verifiedAccount(),run=randomUUID(),directory=resolve('.local/publication-e2e',run),path=resolve(directory,'documento.patron');let cad=await launch(run,true);
 try{
  let page=await cad.firstWindow();
  const login=page.locator('form').filter({has:page.getByRole('heading',{name:'Iniciar sesión',exact:true})});
  await login.locator('input[name=email]').fill(a.email);await login.locator('input[name=password]').fill(PASSWORD);
  await login.getByRole('button',{name:'Iniciar sesión',exact:true}).click();await ui(page.getByRole('heading',{name:'Perfil',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Guardar',exact:true}).click();await page.getByRole('button',{name:'Publicación',exact:true}).click();
  const saved=await readFile(path);
  await page.getByLabel('Nombre del nuevo proyecto').fill('Respuesta perdida');await page.getByRole('button',{name:'Crear proyecto',exact:true}).click();
  await ui(page.getByLabel('Proyecto',{exact:true})).not.toHaveValue('');await page.getByLabel('Nombre del patrón').fill('Patrón guardado');
  await page.getByRole('button',{name:'Preparar editable y vista previa'}).click();await ui(page.getByRole('region',{name:'Archivos preparados'})).toBeVisible();
  await page.getByRole('button',{name:'Publicar versión',exact:true}).click();
  await ui.poll(async()=>{try{return await readFile(resolve(directory,'commit-response-dropped'),'utf8');}catch{return '';}}).toBe('accepted');
  stop(cad);await host.finishPublications();expect(await readFile(path)).toEqual(saved);
  cad=await launch(run);page=await cad.firstWindow();await ui(page.getByRole('button',{name:'Abrir archivo',exact:true})).toBeEnabled();
  await page.getByRole('button',{name:'Abrir archivo',exact:true}).click();await page.getByRole('button',{name:'Publicación',exact:true}).click();
  await ui(page.getByText('Versión publicada',{exact:true})).toBeVisible({timeout:25000});
  const versions=(await host.pool.query('SELECT v.* FROM versions v JOIN patterns p ON p.id=v.pattern_id WHERE p.owner_id=$1',[a.accountId])).rows;
  expect(versions).toHaveLength(1);expect(versions[0].local_revision_id).toBe(JSON.parse(saved.toString()).revisionId);
  const files=(await host.pool.query("SELECT private_key FROM stored_files WHERE version_id=$1 AND role='editable'",[versions[0].id])).rows;
  expect(Buffer.from(await host.blobs.get(files[0].private_key))).toEqual(saved);
  expect((await host.pool.query("SELECT count(*) FROM operation_results WHERE requester_id=$1 AND operation_type='commitPublication'",[a.accountId])).rows[0].count).toBe('1');
 }finally{stop(cad);}
},60000);
