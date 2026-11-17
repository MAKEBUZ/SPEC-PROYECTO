import {beforeAll,afterAll,it,expect} from 'vitest';
import {chromium,_electron,expect as ui,type Browser,type BrowserContext} from '@playwright/test';
import {spawn,spawnSync,type ChildProcess} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {existsSync} from 'node:fs';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {startAccountHost,type AccountHost,PASSWORD} from '../support/account-host.js';
import {publishedFixture} from '../support/publication-fixture.js';
import {LocalSuppressionLog} from '../../apps/api/src/storage/suppression-log.js';
let host:AccountHost,browser:Browser,server:ChildProcess,directory:string;
const origin='https://patron.example.invalid';
beforeAll(async()=>{
 directory=await mkdtemp(join(tmpdir(),'patron-trash-ui-'));host=await startAccountHost(new LocalSuppressionLog(join(directory,'suppression')),true);
 server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','apps/web','--hostname','127.0.0.1','--port','4334'],{windowsHide:true,stdio:'ignore',env:{...process.env,NEXT_TELEMETRY_DISABLED:'1'}});
 let ready=false;for(let i=0;i<100;i++){try{if((await fetch('http://127.0.0.1:4334/trash')).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}if(!ready)throw Error('Portal local no disponible');
 const executablePath=['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(existsSync);if(!executablePath)throw Error('Falta Edge local');browser=await chromium.launch({executablePath,headless:true});
},30000);
afterAll(async()=>{await browser?.close();server?.kill();await host?.close();if(directory){if(!resolve(directory).startsWith(resolve(tmpdir(),'patron-trash-ui-')))throw Error('Unsafe cleanup');await rm(directory,{recursive:true,force:true});}});
async function bridge(context:BrowserContext,fault:{dropPurge?:boolean}={}){await context.route(origin+'/**',async route=>{
 const request=route.request(),url=new URL(request.url());
 if(!url.pathname.startsWith('/v1/')){await route.fulfill({response:await route.fetch({url:'http://127.0.0.1:4334'+url.pathname+url.search})});return;}
 const headers:Record<string,string>={};for(const [key,value]of Object.entries(await request.allHeaders()))if(['cookie','origin','sec-fetch-site','x-csrf-token','x-patron-client'].includes(key))headers[key]=value;
 const response=await host.request(request.method(),url.pathname.slice(3)+url.search,request.postData()?request.postDataJSON():undefined,undefined,headers);
 if(fault.dropPurge&&request.method()==='DELETE'&&url.pathname.startsWith('/v1/trash/')){fault.dropPurge=false;await route.abort('failed');return;}
 const outgoing:Record<string,string>={'content-type':'application/json','cache-control':'no-store'},cookies=response.headers.getSetCookie();if(cookies.length)outgoing['set-cookie']=cookies.join('\n');const csrf=response.headers.get('x-csrf-token');if(csrf)outgoing['x-csrf-token']=csrf;
 await route.fulfill({status:response.status,headers:outgoing,body:JSON.stringify(response.body)});
});}
it('confirms scope, restores the batch, purges remotely and keeps the local editable',async()=>{
 const account=await host.verifiedAccount(),published=await publishedFixture(host,account.session),local=join(directory,'local.patron');await writeFile(local,published.editable);
 const context=await browser.newContext({serviceWorkers:'block'});await bridge(context,{dropPurge:true});const page=await context.newPage();
 try{
  await page.goto(origin+'/account');const login=page.locator('form').filter({has:page.getByRole('heading',{name:'Iniciar sesión',exact:true})});await login.locator('input[name=email]').fill(account.email);await login.locator('input[name=password]').fill(PASSWORD);await login.getByRole('button',{name:'Iniciar sesión',exact:true}).click();await ui(page.getByText('Sesión iniciada.',{exact:true})).toBeVisible();
  await page.goto(origin+'/trash');await page.getByRole('button',{name:'Enviar Library a papelera',exact:true}).click();
  const review=page.getByRole('form',{name:'Revisar contenido afectado'});await ui(review.getByText(/1 versiones; 2 archivos/)).toBeVisible();await ui(review.getByRole('button',{name:'Confirmar envío a papelera'})).toBeDisabled();
  await review.getByRole('checkbox').check();await review.getByRole('button',{name:'Confirmar envío a papelera'}).click();await ui(page.getByText('Operación confirmada. Actualiza la lista para consultar su estado actual.')).toBeVisible();
  await page.getByRole('button',{name:'Ver papelera',exact:true}).click();await page.getByRole('button',{name:'Restaurar Library',exact:true}).click();await review.getByRole('checkbox').check();await review.getByRole('button',{name:'Confirmar restauración'}).click();await ui(page.getByText('Operación confirmada. Actualiza la lista para consultar su estado actual.')).toBeVisible();
  expect((await host.pool.query('SELECT state FROM projects WHERE id=$1',[published.projectId])).rows[0].state).toBe('active');
  await page.getByRole('button',{name:'Proyectos activos',exact:true}).click();await page.getByRole('button',{name:'Enviar Library a papelera',exact:true}).click();await review.getByRole('checkbox').check();await review.getByRole('button',{name:'Confirmar envío a papelera'}).click();await ui(page.getByText('Operación confirmada. Actualiza la lista para consultar su estado actual.')).toBeVisible();
  await page.getByRole('button',{name:'Ver papelera',exact:true}).click();await page.getByRole('button',{name:'Eliminar definitivamente Library',exact:true}).click();await ui(review.getByText(/Se perderá la posibilidad/)).toBeVisible();await review.getByRole('checkbox').check();await review.getByRole('button',{name:'Confirmar eliminación definitiva'}).click();await ui(page.getByRole('alert').filter({hasText:/Resultado pendiente de comprobar/})).toBeVisible();
  await page.reload();await ui(page.getByRole('button',{name:'Comprobar pendientes',exact:true})).toBeEnabled();
  await host.finishPurges();await page.getByRole('button',{name:'Comprobar pendientes',exact:true}).click();await ui(page.getByText('Resultados comprobados. Actualiza la lista.')).toBeVisible();await page.getByRole('button',{name:'Ver papelera',exact:true}).click();await ui(page.getByRole('button',{name:'Restaurar Library',exact:true})).toHaveCount(0);
  expect((await host.pool.query('SELECT id FROM projects WHERE id=$1',[published.projectId])).rowCount).toBe(0);expect(await readFile(local)).toEqual(published.editable);
 }finally{await context.close();}
},60000);
it('requires a fresh review when preflight detects a stale destructive scope',async()=>{
 const account=await host.verifiedAccount(),published=await publishedFixture(host,account.session),context=await browser.newContext({serviceWorkers:'block'});await bridge(context);const page=await context.newPage();
 try{
  await page.goto(origin+'/account');const login=page.locator('form').filter({has:page.getByRole('heading',{name:'Iniciar sesión',exact:true})});await login.locator('input[name=email]').fill(account.email);await login.locator('input[name=password]').fill(PASSWORD);await login.getByRole('button',{name:'Iniciar sesión',exact:true}).click();await ui(page.getByText('Sesión iniciada.',{exact:true})).toBeVisible();await page.goto(origin+'/trash');
  await page.getByRole('button',{name:'Enviar Library a papelera',exact:true}).click();const review=page.getByRole('form',{name:'Revisar contenido afectado'});await review.getByRole('checkbox').check();
  await host.pool.query("INSERT INTO patterns(id,project_id,owner_id,name) VALUES($1,$2,$3,'Patrón nuevo')",[randomUUID(),published.projectId,account.accountId]);
  await review.getByRole('button',{name:'Confirmar envío a papelera'}).click();await ui(page.getByText('El contenido afectado cambió. Revisa de nuevo la eliminación antes de confirmarla.',{exact:true})).toBeVisible();await ui(review).toHaveCount(0);
  expect((await host.pool.query('SELECT state FROM projects WHERE id=$1',[published.projectId])).rows[0].state).toBe('active');
  await page.getByRole('button',{name:'Enviar Library a papelera',exact:true}).click();await ui(review.getByText('Patrón: Patrón nuevo',{exact:true})).toBeVisible();await ui(review.getByRole('checkbox')).not.toBeChecked();await review.getByRole('button',{name:'Cancelar',exact:true}).click();
  expect((await host.pool.query('SELECT state FROM projects WHERE id=$1',[published.projectId])).rows[0].state).toBe('active');
 }finally{await context.close();}
},60000);
it('CAD uses protected session and IPC to trash and restore an independent pattern without touching its local file',async()=>{
 const account=await host.verifiedAccount(),published=await publishedFixture(host,account.session),run=randomUUID(),root=resolve('.local/publication-e2e',run),local=join(root,'documento.patron');await mkdir(root,{recursive:true});await writeFile(local,published.editable);
 const env:Record<string,string>={};for(const [k,v]of Object.entries(process.env))if(v!==undefined&&k!=='ELECTRON_RUN_AS_NODE')env[k]=v;env.PATRON_E2E_API=host.testBaseUrl;env.PATRON_E2E_RUN=run;
 const cad=await _electron.launch({executablePath:resolve('node_modules/electron/dist/electron.exe'),args:[resolve('dist/tests/desktop/publication-e2e-main.js')],env,timeout:30000});
 try{
  const page=await cad.firstWindow(),login=page.locator('form').filter({has:page.getByRole('heading',{name:'Iniciar sesión',exact:true})});await login.locator('input[name=email]').fill(account.email);await login.locator('input[name=password]').fill(PASSWORD);await login.getByRole('button',{name:'Iniciar sesión',exact:true}).click();await ui(page.getByRole('heading',{name:'Perfil',exact:true})).toBeVisible();
  await page.getByText('Proyectos y papelera de la cuenta',{exact:true}).click();await page.getByRole('button',{name:'Ver patrones de Library',exact:true}).click();await page.getByRole('button',{name:'Enviar Patrón a papelera',exact:true}).click();
  const review=page.getByRole('form',{name:'Revisar contenido afectado'});await review.getByRole('checkbox').check();await review.getByRole('button',{name:'Confirmar envío a papelera'}).click();await ui(page.getByText('Operación confirmada. Actualiza la lista para consultar su estado actual.')).toBeVisible();
  await page.getByRole('button',{name:'Ver papelera',exact:true}).click();await page.getByRole('button',{name:'Restaurar Patrón',exact:true}).click();await review.getByRole('checkbox').check();await review.getByRole('button',{name:'Confirmar restauración'}).click();await ui(page.getByText('Operación confirmada. Actualiza la lista para consultar su estado actual.')).toBeVisible();
  expect((await host.pool.query('SELECT state FROM patterns WHERE id=$1',[published.patternId])).rows[0].state).toBe('active');expect(await readFile(local)).toEqual(published.editable);
 }finally{const pid=cad.process().pid;if(pid)spawnSync('taskkill',['/PID',String(pid),'/T','/F'],{windowsHide:true,stdio:'ignore',timeout:10000});}
},60000);
it('account UI reports definitive deletion only after the real content purge and retains the local document',async()=>{
 const account=await host.verifiedAccount(),published=await publishedFixture(host,account.session),local=join(directory,'account-local.patron');await writeFile(local,published.editable);
 const context=await browser.newContext({serviceWorkers:'block'});await bridge(context);const page=await context.newPage();
 try{
  await page.goto(origin+'/account');const form=(title:string)=>page.locator('form').filter({has:page.getByRole('heading',{name:title,exact:true})});const login=form('Iniciar sesión');await login.locator('input[name=email]').fill(account.email);await login.locator('input[name=password]').fill(PASSWORD);await login.getByRole('button',{name:'Iniciar sesión',exact:true}).click();await ui(page.getByText('Sesión iniciada.',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Revisar eliminación de cuenta'}).click();const deletion=form('Solicitar eliminación');await deletion.locator('input[name=currentPassword]').fill(PASSWORD);await deletion.locator('input[name=phrase]').fill('ELIMINAR MI CUENTA');await deletion.getByRole('button',{name:'Solicitar eliminación',exact:true}).click();await ui(login).toBeVisible();
  await page.getByRole('button',{name:'Comprobar ahora',exact:true}).click();await ui(page.getByText('Eliminación pendiente',{exact:true})).toBeVisible();
  await host.pool.query("UPDATE accounts SET deletion_deadline=clock_timestamp()-interval '1 second' WHERE id=$1",[account.accountId]);await host.finishAccountPurges();
  await page.getByRole('button',{name:'Comprobar ahora',exact:true}).click();await ui(page.getByText('Eliminación definitiva confirmada',{exact:true})).toBeVisible();expect(await readFile(local)).toEqual(published.editable);expect((await host.pool.query('SELECT id FROM projects WHERE id=$1',[published.projectId])).rowCount).toBe(0);
 }finally{await context.close();}
},60000);
