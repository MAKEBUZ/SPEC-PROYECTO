import {chromium,expect as ui} from '@playwright/test';
import {expect} from 'vitest';
import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import type {AccountHost} from './account-host.js';
import {PASSWORD} from './account-host.js';

/** Actual portal/API with a transport-only localhost bridge; not physical PWA installation. */
export async function verifyPublishedJourney(host:AccountHost,email:string,pdfPath:string,source:string){
 const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','apps/web','--hostname','127.0.0.1','--port','4324'],{windowsHide:true,stdio:'ignore',env:{...process.env,NEXT_TELEMETRY_DISABLED:'1'}});
 const executablePath=['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
 if(!executablePath){server.kill();throw Error('EDGE_REQUIRED');}
 const browser=await chromium.launch({executablePath,headless:true});
 const origin='https://patron.example.invalid';
 try{
  let ready=false;for(let i=0;i<100;i++){try{if((await fetch('http://127.0.0.1:4324/account')).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}if(!ready)throw Error('PORTAL_NOT_READY');
  const context=await browser.newContext({serviceWorkers:'block',viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  await context.route(origin+'/**',async route=>{
   const request=route.request(),url=new URL(request.url());
   if(!url.pathname.startsWith('/v1/')){const response=await route.fetch({url:'http://127.0.0.1:4324'+url.pathname+url.search});await route.fulfill({response});return;}
   const headers:Record<string,string>={};for(const[k,v]of Object.entries(await request.allHeaders()))if(['cookie','origin','sec-fetch-site','x-csrf-token','x-patron-client'].includes(k))headers[k]=v;
   if(url.pathname.startsWith('/v1/files/')&&url.pathname.endsWith('/content')){const response=await fetch(host.testBaseUrl+url.pathname.slice(3),{headers});await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:Buffer.from(await response.arrayBuffer())});return;}
   const response=await host.request(request.method(),url.pathname.slice(3)+url.search,request.postData()?request.postDataJSON():undefined,undefined,headers);
   const outgoing:Record<string,string>={'content-type':'application/json','cache-control':'no-store'};const cookies=response.headers.getSetCookie();if(cookies.length)outgoing['set-cookie']=cookies.join('\n');const csrf=response.headers.get('x-csrf-token');if(csrf)outgoing['x-csrf-token']=csrf;
   await route.fulfill({status:response.status,headers:outgoing,body:JSON.stringify(response.body)});
  });
  const page=await context.newPage();await page.goto(origin+'/account');
  const form=page.locator('form').filter({has:page.getByRole('heading',{name:'Iniciar sesión',exact:true})});await form.locator('input[name=email]').fill(email);await form.locator('input[name=password]').fill(PASSWORD);await form.getByRole('button',{name:'Iniciar sesión',exact:true}).click();await ui(page.getByText('Sesión iniciada.',{exact:true})).toBeVisible();
  await page.goto(origin+'/library');await page.getByRole('button',{name:'Proyecto con PDF',exact:true}).click();await page.getByRole('button',{name:'Patrón con PDF',exact:true}).click();await page.getByRole('button',{name:'Versión 1',exact:true}).click();await ui(page.getByAltText('Vista previa del patrón')).toBeVisible();
  for(const [label,path]of [['Descargar PDF',pdfPath],['Descargar editable',source]] as const){const pending=page.waitForEvent('download');await page.getByRole('button',{name:label,exact:true}).click();const download=await pending;expect(await readFile((await download.path())!)).toEqual(await readFile(path));}
  const original=await readFile(source);
  await page.goto(origin+'/trash');await page.getByRole('button',{name:'Enviar Proyecto con PDF a papelera',exact:true}).click();const review=page.getByRole('form',{name:'Revisar contenido afectado'});await review.getByRole('checkbox').check();await review.getByRole('button',{name:'Confirmar envío a papelera'}).click();await ui(page.getByText('Operación confirmada. Actualiza la lista para consultar su estado actual.')).toBeVisible();
  await page.getByRole('button',{name:'Ver papelera',exact:true}).click();await page.getByRole('button',{name:'Restaurar Proyecto con PDF',exact:true}).click();await review.getByRole('checkbox').check();await review.getByRole('button',{name:'Confirmar restauración'}).click();await ui(page.getByText('Operación confirmada. Actualiza la lista para consultar su estado actual.')).toBeVisible();
  expect(await readFile(source)).toEqual(original);
  await page.goto(origin+'/account');await page.getByRole('button',{name:'Cerrar sesión',exact:true}).click();await page.goto(origin+'/library');await ui(page.getByRole('button',{name:'Proyecto con PDF',exact:true})).toHaveCount(0);
 }finally{await browser.close();server.kill();}
}
