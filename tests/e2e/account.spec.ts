import {browserExecutable,recordBrowser} from '../support/browser-runtime.js';
import { beforeAll, afterAll, it, expect } from 'vitest';
import { chromium, _electron, expect as ui } from '@playwright/test';
import type { Browser, Page, BrowserContext } from '@playwright/test';
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, writeFile, readFile, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { startAccountHost, PASSWORD, NEW_PASSWORD } from '../support/account-host.js';
import type { AccountHost } from '../support/account-host.js';
import { publishedFixture } from '../support/publication-fixture.js';

let host: AccountHost, browser: Browser, server: ChildProcess;
const origin = 'https://patron.example.invalid';
const form = (page: Page, title: string) => page.locator('form').filter({ has: page.getByRole('heading', { name: title, exact: true }) });
async function submit(page: Page, title: string, fields: Record<string,string>) {
  const panel = form(page,title); for (const [name,value] of Object.entries(fields)) await panel.locator(`input[name="${name}"]`).fill(value);
  await panel.getByRole('button', { name: title, exact: true }).click();
}
async function login(page: Page, email: string, password = PASSWORD) { await submit(page,'Iniciar sesión',{email,password}); }
beforeAll(async () => {
  host = await startAccountHost();
  server = spawn(process.execPath, ['node_modules/next/dist/bin/next','start','apps/web','--hostname','127.0.0.1','--port','4321'], { windowsHide: true, stdio: 'ignore', env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' } });
  let ready = false;
  for (let attempt=0; attempt<100; attempt++) { try { if ((await fetch('http://127.0.0.1:4321/account')).ok) { ready=true; break; } } catch {} await new Promise(r => setTimeout(r,100)); }
  if (!ready) throw new Error('El portal de prueba no arrancó. Compila Next antes del ensayo.');
  const executablePath = browserExecutable();
  if (!executablePath) throw new Error('Falta Edge local.');
  browser = await chromium.launch({ executablePath, headless: true });await recordBrowser(browser,'account');
}, 30000);
afterAll(async () => { await browser?.close(); server?.kill(); await host?.close(); });
async function web(mobile: boolean) {
  // This transport bridge exercises account/API behavior. Real service-worker
  // fetch/cache behavior is separately exercised by pwa.spec.ts on localhost.
  const context = await browser.newContext({ serviceWorkers:'block',viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 }, isMobile: mobile, hasTouch: mobile });
  // Transport-only bridge. Every API response comes from Nest/PostgreSQL; no
  // success, auth decision, CSRF token or cookie is fabricated by this fixture.
  await context.route(origin+'/**', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.pathname.startsWith('/v1/')) {
      const headers: Record<string,string> = {};
      for (const [key,value] of Object.entries(await request.allHeaders())) if (['cookie','origin','sec-fetch-site','x-csrf-token','x-patron-client'].includes(key)) headers[key] = value;
      if(url.pathname.startsWith('/v1/files/')&&url.pathname.endsWith('/content')){
        const response=await fetch(host.testBaseUrl+url.pathname.slice(3),{headers});await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:Buffer.from(await response.arrayBuffer())});return;
      }
      const response = await host.request(request.method(), url.pathname.slice(3)+url.search, request.postData() ? request.postDataJSON() : undefined, undefined, headers);
      const outgoing: Record<string,string> = { 'content-type': 'application/json', 'cache-control': 'no-store' };
      const cookies = response.headers.getSetCookie(); if (cookies.length) outgoing['set-cookie'] = cookies.join('\n');
      const csrf = response.headers.get('x-csrf-token'); if (csrf) outgoing['x-csrf-token'] = csrf;
      await route.fulfill({ status: response.status, headers: outgoing, body: JSON.stringify(response.body) });
    } else {
      const response = await route.fetch({ url: 'http://127.0.0.1:4321'+url.pathname+url.search });
      await route.fulfill({ response });
    }
  });
  const page = await context.newPage(); await page.goto(origin+'/account');
  return { context, page };
}

it.each([false,true])('consulta la biblioteca privada y distingue vista previa de producción (PDF: %s)',async includePdf=>{
  const account=await host.verifiedAccount(),published=await publishedFixture(host,account.session,0,includePdf);
  const {context,page}=await web(false);
  try{
    await login(page,account.email);await ui(page.getByText('Sesión iniciada.',{exact:true})).toBeVisible();
    await page.goto(origin+'/library');await page.getByRole('button',{name:'Library',exact:true}).click();await page.getByRole('button',{name:'Patrón',exact:true}).click();await page.getByRole('button',{name:'Versión 1',exact:true}).click();
    await ui(page.getByAltText('Vista previa del patrón')).toBeVisible();await ui(page.getByRole('button',{name:'Descargar editable'})).toBeVisible();await ui(page.getByText(/Autor: Tú/)).toBeVisible();
    if(includePdf){await ui(page.getByText(/PDF de producción a escala 1:1/)).toBeVisible();await ui(page.getByText(/Páginas: 1. Dimensiones: 140 ×/)).toBeVisible();const download=page.waitForEvent('download');await page.getByRole('button',{name:'Descargar PDF',exact:true}).click();const file=await download;expect(await readFile((await file.path())!)).toEqual(published.pdf);}
    else await ui(page.getByText('Esta versión no contiene PDF de producción.',{exact:true})).toBeVisible();
    await page.screenshot({path:'.local/library-review.png',fullPage:true});
    const downloaded=page.waitForEvent('download');await page.getByRole('button',{name:'Descargar editable'}).click();expect((await downloaded).suggestedFilename()).not.toMatch(/[\r\n/\\]/);
  }finally{await context.close();}
},30000);

it('persiste el journal IndexedDB y rechaza escritores obsoletos en dos conexiones',async()=>{
  const {context,page}=await web(false);
  try{
    await context.route(origin+'/journal-storage.js',async route=>route.fulfill({contentType:'text/javascript',body:(await readFile('dist/apps/web/src/operations/storage.js','utf8')).replaceAll('../../../../packages/document/src/operations/journal.js','/journal-domain.js')}));
    await context.route(origin+'/journal-domain.js',async route=>route.fulfill({contentType:'text/javascript',body:(await readFile('dist/packages/document/src/operations/journal.js','utf8')).replaceAll('../../../contracts/src/validation.js','/journal-validation.js')}));
    await context.route(origin+'/journal-validation.js',async route=>route.fulfill({contentType:'text/javascript',body:await readFile('dist/packages/contracts/src/validation.js','utf8')}));
    await context.route(origin+'/journal-entry.js',async route=>route.fulfill({contentType:'text/javascript',body:"import {WebJournalStorage} from '/journal-storage.js'; window.TestJournalStorage=WebJournalStorage;"}));
    await page.addScriptTag({url:origin+'/journal-entry.js',type:'module'});
    const result=await page.evaluate(async()=>{
      const WebJournalStorage=(window as unknown as {TestJournalStorage:typeof import('../../apps/web/src/operations/storage.js').WebJournalStorage}).TestJournalStorage,name=`journal-test-${crypto.randomUUID()}`,a=new WebJournalStorage(name),b=new WebJournalStorage(name);
      await a.append('test',[],'one');const initial=await b.read('test');
      const outcomes=await Promise.allSettled([a.append('test',initial,'two'),b.append('test',initial,'three')]);
      await a.close();await b.close();const reopened=new WebJournalStorage(name),saved=await reopened.read('test');await reopened.close();indexedDB.deleteDatabase(name);
      return {initial,saved,statuses:outcomes.map(r=>r.status).sort()};
    });
    expect(result.initial).toEqual(['one']);expect(result.saved).toHaveLength(2);expect(result.statuses).toEqual(['fulfilled','rejected']);
  }finally{await context.close();}
},30000);

it('muestra resultados históricos sin conexión, confirma limpieza local y oculta el historial al salir',async()=>{
 const account=await host.verifiedAccount(),{context,page}=await web(false);
 try{
  await login(page,account.email);await ui(form(page,'Guardar perfil')).toBeVisible();
  await submit(page,'Guardar perfil',{displayName:'Historial local'});
  const panel=page.getByRole('region',{name:'Operaciones de este dispositivo'});
  await ui(panel.getByText('Éxito confirmado',{exact:true})).toBeVisible();
  const rows=panel.locator('li');const original=(await rows.first().textContent())!;
  await context.setOffline(true);await page.evaluate(()=>window.dispatchEvent(new Event('offline')));
  await ui(panel.getByText(/Resultados históricos/)).toBeVisible();
  await panel.getByRole('button',{name:'Limpiar resueltas',exact:true}).click();
  await ui(panel.getByRole('dialog',{name:'Confirmar limpieza local'})).toBeVisible();
  await panel.getByRole('button',{name:'Cancelar limpieza',exact:true}).click();await ui(rows.first()).toHaveText(original);
  await panel.getByRole('button',{name:'Limpiar resueltas',exact:true}).click();await panel.getByRole('button',{name:'Confirmar limpieza',exact:true}).click();
  await ui(panel.getByText('No hay resultados locales vigentes.',{exact:true})).toBeVisible();
  expect((await host.accountRow(account.accountId)).display_name).toBe('Historial local');
  await context.setOffline(false);await page.evaluate(()=>window.dispatchEvent(new Event('online')));
  await page.getByRole('button',{name:'Cerrar sesión',exact:true}).click();
  await ui(panel.getByText('Inicia sesión válidamente para consultar Pendientes y Resueltas.',{exact:true})).toBeVisible();await ui(panel.locator('li')).toHaveCount(0);
 }finally{await context.close();}
},30000);

it('un cambio de cuenta en otra pestaña oculta identificadores y cantidad del historial anterior',async()=>{
 const first=await host.verifiedAccount(),second=await host.verifiedAccount(),{context,page}=await web(false);
 try{
  await login(page,first.email);await ui(form(page,'Guardar perfil')).toBeVisible();await submit(page,'Guardar perfil',{displayName:'Cuenta anterior'});
  const history=page.getByRole('region',{name:'Operaciones de este dispositivo'});await ui(history.getByText('Éxito confirmado',{exact:true})).toBeVisible();
  const other=await context.newPage();await other.goto(origin+'/account');await login(other,second.email);await ui(form(other,'Guardar perfil')).toBeVisible();
  await ui(history.getByText('Inicia sesión válidamente para consultar Pendientes y Resueltas.',{exact:true})).toBeVisible();await ui(history.locator('li')).toHaveCount(0);
  await ui(other.getByRole('region',{name:'Operaciones de este dispositivo'}).locator('li')).toHaveCount(0);
 }finally{await context.close();}
},30000);

it.each([false,true])('registro, verificación, perfil, contraseña y reset mediante UI/API real; móvil=%s', async mobile => {
  const { context,page } = await web(mobile), email = randomUUID()+'@example.invalid';
  try {
    await submit(page,'Crear cuenta',{email,password:PASSWORD}); await ui(page.getByText(/Cuenta creada/)).toBeVisible();
    await login(page,email); await ui(form(page,'Reenviar verificación')).toBeVisible();
    await ui(page.getByRole('heading',{name:'Perfil',exact:true})).toHaveCount(0);
    await submit(page,'Reenviar verificación',{});
    await ui(page.getByText('Cambio confirmado.',{exact:true})).toBeVisible();
    await submit(page,'Verificar correo',{ token: await host.latestToken(email) });
    await ui(form(page,'Iniciar sesión')).toBeVisible(); await login(page,email);
    await ui(page.getByRole('heading',{name:'Perfil',exact:true})).toBeVisible();
    await submit(page,'Guardar perfil',{ displayName: 'Patronista E2E' }); await ui(page.getByText('Patronista E2E',{exact:true})).toBeVisible();
    await submit(page,'Cambiar contraseña',{ currentPassword: PASSWORD, newPassword: NEW_PASSWORD }); await ui(page.getByText('Cambio confirmado.',{exact:true})).toBeVisible();
    const cookies = await context.cookies(); expect(cookies.some(c => c.name === '__Host-patron-session' && c.secure && c.httpOnly)).toBe(true);
    expect(await page.evaluate(() => document.cookie)).not.toContain('__Host-patron-session');
    await page.getByRole('button',{name:'Cerrar sesión',exact:true}).click(); await ui(form(page,'Iniciar sesión')).toBeVisible();
    await submit(page,'Solicitar restablecimiento',{email}); await ui(page.getByText('Si existe una cuenta, recibirás un enlace de recuperación.',{exact:true})).toBeVisible();
    await submit(page,'Establecer contraseña nueva',{token:await host.latestToken(email),newPassword:PASSWORD});
    await login(page,email); await ui(page.getByRole('heading',{name:'Perfil',exact:true})).toBeVisible();
    await context.setOffline(true); await ui(form(page,'Guardar perfil').getByRole('button')).toBeDisabled(); await context.setOffline(false);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  } finally { await context.close(); }
}, 60000);

it('eliminación y recuperación terminan el acceso limitado; U2 persiste tras logout sin exponer contenido', async () => {
  const account = await host.verifiedAccount(), { context,page } = await web(false);
  try {
    await login(page,account.email); await page.getByRole('button',{name:'Revisar eliminación de cuenta'}).click();
    await submit(page,'Solicitar eliminación',{currentPassword:PASSWORD,phrase:'ELIMINAR MI CUENTA'}); await ui(form(page,'Iniciar sesión')).toBeVisible();
    await login(page,account.email); await ui(page.getByRole('heading',{name:'Cuenta pendiente de eliminación'})).toBeVisible();
    await submit(page,'Recuperar mi cuenta',{confirmationText:'Recuperar mi cuenta'}); await ui(form(page,'Iniciar sesión')).toBeVisible();
    await page.getByRole('button',{name:'Comprobar ahora',exact:true}).click(); await ui(page.getByText('Solicitud cancelada',{exact:true})).toBeVisible();
    await ui(page.getByRole('heading',{name:'Perfil',exact:true})).toHaveCount(0);
    const cookies = await context.cookies(origin+'/v1/deletion-status/'+((await host.pool.query('SELECT request_id FROM deletion_checks WHERE state=$1',[ 'cancelled' ])).rows.at(-1).request_id));
    expect(cookies.some(c => c.name === '__Secure-deletion-status' && c.secure && c.httpOnly)).toBe(true);
    await login(page,account.email); await ui(page.getByRole('heading',{name:'Perfil',exact:true})).toBeVisible();
  } finally { await context.close(); }
}, 60000);

it('CAD real: IPC, perfil y cierre conservan habilitación y documentos locales', async () => {
  const account = await host.verifiedAccount(), run = randomUUID();
  const env: Record<string,string> = {}; for (const [key,value] of Object.entries(process.env)) if (value !== undefined && key !== 'ELECTRON_RUN_AS_NODE') env[key]=value;
  env.PATRON_E2E_API=host.testBaseUrl; env.PATRON_E2E_RUN=run;
  const cad = await _electron.launch({ executablePath: resolve('node_modules/electron/dist/electron.exe'), args: [resolve('dist/tests/desktop/account-e2e-main.js')], env, timeout: 30000 });
  try {
    const page = await cad.firstWindow(); await login(page,account.email); await ui(page.getByRole('heading',{name:'Perfil',exact:true})).toBeVisible();
    await submit(page,'Guardar perfil',{displayName:'Desde CAD E2E'}); await ui(page.getByText('Desde CAD E2E',{exact:true})).toBeVisible();
    await page.getByRole('navigation',{name:'Ajustes de cuenta'}).getByRole('button',{name:'Seguridad',exact:true}).click();await ui(page.getByRole('heading',{name:'Cambiar contraseña',exact:true})).toBeVisible();
    await page.getByRole('navigation',{name:'Ajustes de cuenta'}).getByRole('button',{name:'Perfil',exact:true}).click();await ui(page.getByRole('heading',{name:'Perfil',exact:true})).toBeVisible();
    expect(await page.evaluate(() => typeof (globalThis as unknown as { require: unknown }).require)).toBe('undefined');
    const directory = resolve('.local','account-e2e',run); await mkdir(directory,{recursive:true});
    const local = resolve(directory,'documento-local.patron'), marker = resolve(directory,'offline');
    await writeFile(local,'documento testigo: no modificar durante cierre de cuenta'); const original = await readFile(local);
    await writeFile(marker,'offline'); await page.context().setOffline(true);
    await page.getByRole('button',{name:'Cerrar sesión',exact:true}).click(); await ui(form(page,'Iniciar sesión')).toBeVisible();
    await ui(page.getByText('El trabajo local del CAD permanece habilitado.',{exact:true})).toBeVisible();
    await ui(page.getByText('Sesión cerrada localmente. Invalidación remota pendiente al recuperar conexión.',{exact:true})).toBeVisible();
    expect(await readFile(local)).toEqual(original);
    await unlink(marker); await page.context().setOffline(false);
    await ui.poll(async () => (await host.pool.query('SELECT count(*)::int AS count FROM sessions WHERE account_id=$1 AND revoked_at IS NULL',[account.accountId])).rows[0].count, { timeout: 22000 }).toBe(1); // setup session remains valid; CAD session revoked
  } finally { cad.process().kill(); }
}, 60000);

it('sesión que vence durante guardar perfil: UI informa rechazo y PostgreSQL conserva el perfil', async () => {
  const account = await host.verifiedAccount(), {context,page} = await web(false);
  try {
    await login(page,account.email); await ui(form(page,'Guardar perfil')).toBeVisible();
    await host.pool.query('CREATE SEQUENCE e2e_profile_entered');
    await host.pool.query(`CREATE FUNCTION e2e_delay_profile() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM nextval('e2e_profile_entered'); PERFORM pg_sleep(0.4); RETURN NEW; END; $$`);
    await host.pool.query('CREATE TRIGGER e2e_delay_profile BEFORE UPDATE ON accounts FOR EACH ROW EXECUTE FUNCTION e2e_delay_profile()');
    await page.route('**/v1/account/profile', async route => {
      if (route.request().method() === 'PATCH') {
        await host.pool.query(`WITH old AS (DELETE FROM sessions WHERE account_id=$1 AND id<>$2 RETURNING *), instant AS MATERIALIZED (SELECT clock_timestamp() AS now)
          INSERT INTO sessions SELECT id,account_id,token_hash,access_class,now,now+interval '250 milliseconds',revoked_at FROM old,instant`,[account.accountId,account.session.view.id]);
      }
      await route.fallback();
    });
    await submit(page,'Guardar perfil',{displayName:'No debe guardarse'});
    await ui(page.getByText('La sesión venció. Inicia sesión de nuevo.',{exact:true})).toBeVisible();
    expect((await host.accountRow(account.accountId)).display_name).not.toBe('No debe guardarse');
    expect((await host.pool.query('SELECT is_called FROM e2e_profile_entered')).rows[0].is_called).toBe(true); // Mutation entered; not merely a rejection at the initial guard.
    await ui(page.getByRole('heading',{name:'Perfil',exact:true})).toHaveCount(0);
  } finally {
    await host.pool.query('DROP TRIGGER IF EXISTS e2e_delay_profile ON accounts'); await host.pool.query('DROP FUNCTION IF EXISTS e2e_delay_profile()'); await host.pool.query('DROP SEQUENCE IF EXISTS e2e_profile_entered'); await context.close();
  }
}, 60000);
it('T061 shares durable admission across tabs and transfers lifecycle ownership after pagehide',async()=>{
 const {context,page}=await web(false);try{
  await context.route(origin+'/lifecycle-probe',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>Lifecycle validation</title>'}));
  await context.route(origin+'/probe/**',async route=>{
   const pathname=new URL(route.request().url()).pathname.slice('/probe/'.length),root=resolve('dist'),file=resolve(root,pathname);
   if(!file.startsWith(root+'\\')||!file.endsWith('.js'))throw Error('Unsafe probe path');
   await route.fulfill({contentType:'text/javascript',body:await readFile(file,'utf8')});
  });
  const attach=async(p:Page)=>{await p.goto(origin+'/lifecycle-probe');await p.addScriptTag({type:'module',content:"import {webOperationLifecycle,attachWebOperations} from '/probe/apps/web/src/operations/lifecycle.js';window.lifecycleProbe=webOperationLifecycle();window.stopProbe=attachWebOperations(()=>{});"});await ui.poll(()=>p.evaluate(()=>!!(window as any).lifecycleProbe)).toBe(true);};
  await attach(page);await ui.poll(()=>page.evaluate(()=>(window as any).lifecycleProbe?.active)).toBe(true);
  const other=await context.newPage();await attach(other);expect(await other.evaluate(()=>(window as any).lifecycleProbe.active)).toBe(false);
  const accountId=randomUUID(),resource=randomUUID();
  const begin=(p:Page)=>p.evaluate(async({accountId,resource})=>{try{await (window as any).lifecycleProbe.beginMutation(accountId,'trashPattern',{operationId:crypto.randomUUID()},[{kind:'pattern',id:resource}]);return 'admitted';}catch(e){return (e as Error).message;}},{accountId,resource});
  expect((await Promise.all([begin(page),begin(other)])).sort()).toEqual(['OPERATION_PENDING','admitted']);
  await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pagehide')));
  await ui.poll(()=>other.evaluate(()=>(window as any).lifecycleProbe.active)).toBe(true);
  expect(await page.evaluate(()=>(window as any).lifecycleProbe.active)).toBe(false);
  await attach(other);await ui.poll(()=>other.evaluate(()=>(window as any).lifecycleProbe?.active)).toBe(true);
  expect(await begin(other)).toBe('OPERATION_PENDING');
 }finally{await context.close();}
},30000);
