import {browserExecutable,recordBrowser} from '../support/browser-runtime.js';
import { beforeAll,afterAll,it,expect } from 'vitest';
import { chromium,expect as ui } from '@playwright/test';
import type { Browser } from '@playwright/test';
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
let browser:Browser,server:ChildProcess;
const origin='http://127.0.0.1:4322';
beforeAll(async()=>{
  server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','apps/web','--hostname','127.0.0.1','--port','4322'],{windowsHide:true,stdio:'ignore',env:{...process.env,NEXT_TELEMETRY_DISABLED:'1'}});
  let ready=false;for(let i=0;i<100;i++){try{if((await fetch(origin+'/manifest.webmanifest')).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}if(!ready)throw new Error('Compila el portal antes de probar la PWA.');
  const executablePath=browserExecutable();if(!executablePath)throw new Error('Falta Edge local.');browser=await chromium.launch({executablePath,headless:true});await recordBrowser(browser,'pwa');
},30000);
it('keeps account and library usable at narrow portrait and landscape sizes without private offline content',async()=>{
 const context=await browser.newContext(),page=await context.newPage();
 try{
  for(const viewport of [{width:320,height:640},{width:844,height:390}]){
   await page.setViewportSize(viewport);
   for(const route of ['/account','/library']){
    await page.goto(origin+route);await ui(page.getByRole('heading',{level:1})).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
   }
  }
  await page.evaluate(async()=>{await navigator.serviceWorker.ready;});
  await context.setOffline(true);await page.goto(origin+'/account');
  await ui(page.getByRole('heading',{name:'Sin conexión',exact:true})).toBeVisible();
  expect(await page.locator('input[type="password"]').count()).toBe(0);
 }finally{await context.close();}
},30000);
afterAll(async()=>{await browser?.close();server?.kill();});
it('provides install assets and caches only a neutral public offline page',async()=>{
  const context=await browser.newContext(),page=await context.newPage();
  try{
    const manifest=await (await fetch(origin+'/manifest.webmanifest')).json() as {display:string;start_url:string;icons:{src:string}[]};expect(manifest).toMatchObject({display:'standalone',start_url:'/library'});
    for(const icon of manifest.icons){const response=await fetch(origin+icon.src);expect(response.status).toBe(200);expect([...new Uint8Array(await response.arrayBuffer()).slice(0,8)]).toEqual([137,80,78,71,13,10,26,10]);}
    await page.goto(origin+'/account');await page.evaluate(async()=>{await navigator.serviceWorker.ready;});await page.reload();
    await page.evaluate(async()=>{await fetch('/v1/account/profile',{cache:'no-store'});});
    const cached=await page.evaluate(async()=>{const paths=[];for(const key of await caches.keys())for(const request of await (await caches.open(key)).keys())paths.push(new URL(request.url).pathname);return paths.sort();});
    expect(cached).toEqual(['/icons/icon-192.png','/icons/icon-512.png','/icons/maskable-512.png','/offline.html']);
    await context.setOffline(true);await page.goto(origin+'/library');await ui(page.getByRole('heading',{name:'Sin conexión',exact:true})).toBeVisible();await ui(page.getByText('El trabajo local sin conexión se realiza en el CAD de Windows.',{exact:true})).toBeVisible();
  }finally{await context.close();}
},30000);
