// Reproducible, disposable local demo. No AWS clients, SMTP or production data.
import 'reflect-metadata';
import {spawn,spawnSync} from 'node:child_process';
import {randomBytes,randomUUID} from 'node:crypto';
import {mkdir,readFile,writeFile,readdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {Pool} from 'pg';
import {chromium,_electron,expect} from '@playwright/test';
import {AuthModule} from '../../dist/apps/api/src/auth/auth.module.js';
import {PasswordCorpus} from '../../dist/apps/api/src/auth/password-index.js';
import {PasswordService} from '../../dist/apps/api/src/auth/password.service.js';
import {migrate} from '../../dist/apps/api/src/db/migrate.js';
import {createLocalApi} from '../../dist/apps/api/src/http/bootstrap.js';
import {LocalBlobStore} from '../../dist/apps/api/src/storage/blob-store.js';

if(process.platform!=='win32')throw Error('Demo validada para Windows 11 x64.');
const smoke=process.argv.includes('--smoke'),run=randomUUID(),directory=resolve('.local/demo',run);
const name='patron-demo-'+run,password=randomBytes(32).toString('hex'),origin='https://patron.example.invalid';
const browserPath=['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
if(!browserPath)throw Error('Instala Microsoft Edge antes de iniciar la demo.');
const docker=args=>{const r=spawnSync('docker',args,{encoding:'utf8',timeout:120000,windowsHide:true,env:{...process.env,POSTGRES_PASSWORD:password}});if(r.status!==0)throw Error(r.stderr||r.error?.message||'DOCKER_FAILED');return r.stdout.trim();};
let container=false,pool,api,web,browser,cad,timer,dispatch,corpus=new PasswordCorpus();
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
await mkdir(join(directory,'mail'),{recursive:true});
try{
 docker(['run','-d','--name',name,'--label','patronaje.purpose=demo','-p','127.0.0.1::5432','-e','POSTGRES_PASSWORD','-e','POSTGRES_DB=patron_demo','--tmpfs','/var/lib/postgresql:rw','postgres:18.7']);container=true;
 let ready=false;for(let i=0;i<60;i++){const r=spawnSync('docker',['exec',name,'pg_isready','-U','postgres','-d','patron_demo'],{windowsHide:true,stdio:'ignore'});if(r.status===0){ready=true;break;}await delay(500);}if(!ready)throw Error('POSTGRES_NOT_READY');
 const port=docker(['port',name,'5432/tcp']).match(/^127\.0\.0\.1:(\d+)$/)?.[1];if(!port)throw Error('LOCAL_PORT_REQUIRED');
 pool=new Pool({connectionString:`postgresql://postgres:${password}@127.0.0.1:${port}/patron_demo`});
 ready=false;for(let i=0;i<60;i++){try{await pool.query('SELECT 1');ready=true;break;}catch{await delay(500);}}if(!ready)throw Error('POSTGRES_TCP_NOT_READY');
 await migrate(pool,resolve('apps/api/src/db/migrations'));
 await corpus.reload('.local/password-index',JSON.parse(await readFile('tools/assets/password-index.json','utf8')));
 const mailTransport={async send(message){const file=join(directory,'mail',randomUUID()+'.json');await writeFile(file,JSON.stringify(message,null,2),{flag:'wx'});console.log('Correo capturado en '+file+'; abre el enlace en el navegador de esta demo.');}};
 api=await createLocalApi(AuthModule.withOutbox({pool,publicOrigin:origin,operationKey:randomBytes(32),operationKeyVersion:'demo-v1',passwords:new PasswordService(corpus),outboxKeyId:'demo-v1',outboxKeys:new Map([['demo-v1',randomBytes(32)]]),mailTransport,blobStore:new LocalBlobStore(join(directory,'blobs')),renderAssets:{wasm:await readFile('node_modules/@resvg/resvg-wasm/index_bg.wasm'),font:await readFile('.local/assets/NotoSans-Regular.ttf')},artifactRunner:pathToFileURL(resolve('dist/apps/api/src/publications/artifact-runner.js'))}),undefined,false);
 await api.listen(0,'127.0.0.1');const base='http://127.0.0.1:'+api.getHttpServer().address().port;
 const worker=api.get('PATRON_OUTBOX_WORKER',{strict:false});timer=setInterval(()=>{if(!dispatch)dispatch=worker.dispatchPending().catch(()=>console.error('DEMO_MAIL_FAILED')).finally(()=>{dispatch=undefined;});},500);
 // Port 4328 is reserved for this documented demo; fail rather than reuse another service.
 const {createServer}=await import('node:net');const probe=createServer();await new Promise((ok,fail)=>{probe.once('error',fail);probe.listen(4328,'127.0.0.1',ok);});await new Promise(ok=>probe.close(ok));
 web=spawn(process.execPath,['node_modules/next/dist/bin/next','start','apps/web','--hostname','127.0.0.1','--port','4328'],{windowsHide:true,stdio:'ignore',env:{...process.env,PATRON_API_ORIGIN:'',NEXT_TELEMETRY_DISABLED:'1'}});
 ready=false;for(let i=0;i<100;i++){if(web.exitCode!==null)throw Error('PORTAL_EXITED');try{if((await fetch('http://127.0.0.1:4328/account')).ok){ready=true;break;}}catch{}await delay(200);}if(!ready)throw Error('PORTAL_NOT_READY');
 browser=await chromium.launch({executablePath:browserPath,headless:smoke});
 const context=await browser.newContext({serviceWorkers:'block',acceptDownloads:true});
 // Explicit transport bridge, like the E2E harness: real API/DB, not TLS/PWA certification.
 await context.route('**/*',async route=>{try{
  const request=route.request(),url=new URL(request.url());if(url.origin!==origin){await route.abort();return;}
  if(!url.pathname.startsWith('/v1/')){const response=await route.fetch({url:'http://127.0.0.1:4328'+url.pathname+url.search});await route.fulfill({response});return;}
  const headers={};for(const [k,v]of Object.entries(await request.allHeaders()))if(['content-type','cookie','origin','sec-fetch-site','x-csrf-token','x-patron-client'].includes(k))headers[k]=v;
  const response=await fetch(base+url.pathname+url.search,{method:request.method(),headers,...request.postDataBuffer()?{body:request.postDataBuffer()}: {},redirect:'error'});
  const outgoing=Object.fromEntries(response.headers);delete outgoing['content-length'];delete outgoing['transfer-encoding'];const cookies=response.headers.getSetCookie();if(cookies.length)outgoing['set-cookie']=cookies.join('\n');
  await route.fulfill({status:response.status,headers:outgoing,body:Buffer.from(await response.arrayBuffer())});
 }catch{await route.abort().catch(()=>{});}});
 const page=await context.newPage();await page.goto(origin+'/account');
 const env={...process.env,PATRON_DEMO_API:base,PATRON_DEMO_RUN:run};delete env.ELECTRON_RUN_AS_NODE;
 cad=await _electron.launch({executablePath:resolve('node_modules/electron/dist/electron.exe'),args:[resolve('tools/demo/desktop.mjs')],env});
 await (await cad.firstWindow()).waitForLoadState('domcontentloaded');
 console.log('DEMO_READY: API '+base+'/v1; portal y CAD abiertos. Datos: '+directory);
 console.log('Datos sintéticos únicamente. Correo en archivos locales, sin envío. Ctrl+C termina y elimina la base efímera.');
 if(smoke){
  const email='demo-'+run+'@example.invalid',secret='Patron-Ensayo-42!Árbol';
  const post=async(path,body)=>{const response=await fetch(base+'/v1'+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});if(!response.ok)throw Error('DEMO_REQUEST_FAILED:'+path+':'+response.status);return response.json();};
  await post('/accounts',{operationId:randomUUID(),email,password:secret});
  if(dispatch)await dispatch;await worker.dispatchPending();
  const messages=await readdir(join(directory,'mail'));if(messages.length!==1)throw Error('DEMO_MAIL_MISSING');
  const mail=JSON.parse(await readFile(join(directory,'mail',messages[0]),'utf8'));
  const token=new URL(mail.text.match(/https:\/\/\S+/)[0]).searchParams.get('token');
  await post('/email-verification/confirm',{operationId:randomUUID(),token});
  const form=page.locator('form').filter({has:page.getByRole('heading',{name:'Iniciar sesión',exact:true})});
  await form.locator('input[name=email]').fill(email);await form.locator('input[name=password]').fill(secret);await form.getByRole('button',{name:'Iniciar sesión',exact:true}).click();await expect(page.getByText('Sesión iniciada.',{exact:true})).toBeVisible();
  const cadPage=await cad.firstWindow(),login=cadPage.locator('form').filter({has:cadPage.getByRole('heading',{name:'Iniciar sesión',exact:true})});
  await login.locator('input[name=email]').fill(email);await login.locator('input[name=password]').fill(secret);await login.getByRole('button',{name:'Iniciar sesión',exact:true}).click();await expect(cadPage.getByRole('heading',{name:'Perfil',exact:true})).toBeVisible();
  await writeFile(join(directory,'smoke.json'),JSON.stringify({date:new Date().toISOString(),result:'passed',api:true,portal:true,cad:true,scope:'arranque, registro, correo capturado, verificación y acceso web/CAD; no publicación ni PWA física'},null,2));console.log('DEMO_SMOKE_PASSED');
 }
 else await new Promise(resolve=>{process.once('SIGINT',resolve);process.once('SIGTERM',resolve);browser.once('disconnected',resolve);});
}finally{
 clearInterval(timer);await dispatch;await cad?.close().catch(()=>{});await browser?.close().catch(()=>{});web?.kill();await api?.close();await corpus.close();await pool?.end();if(container)docker(['rm','--force',name]);
}
