import {it,expect} from 'vitest';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {chromium} from '@playwright/test';

it('recovers exact IndexedDB backup across reopen and isolates damage without overwriting it',async()=>{
 const paths=['apps/web/src/operations/history-storage.js','packages/document/src/operations/history-storage.js','packages/document/src/operations/closed.js','packages/document/src/operations/journal.js','packages/document/src/operations/time-check.js','packages/document/src/operations/time-evidence.js','packages/contracts/src/http-dto.js','packages/contracts/src/schema.js','packages/contracts/src/validation.js'];
 const files=new Map(await Promise.all(paths.map(async p=>['/'+p,await readFile('dist/'+p,'utf8')] as const)));
 const server=createServer((req,res)=>{const script=files.get(req.url??'');res.setHeader('Content-Type',script?'text/javascript':'text/html');res.end(script??'<html>History storage test</html>');});
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const address=server.address();if(!address||typeof address==='string')throw Error();
 const executablePath=['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(existsSync);if(!executablePath)throw Error('Missing Edge');
 const browser=await chromium.launch({executablePath,headless:true});try{
  const page=await browser.newPage();await page.goto(`http://127.0.0.1:${address.port}`);
  await page.addScriptTag({type:'module',content:"import {WebHistoryStorage} from '/apps/web/src/operations/history-storage.js'; globalThis.historyTest={WebHistoryStorage};"});
  await page.waitForFunction(()=>Object.hasOwn(globalThis,'historyTest'));
  const result=await page.evaluate(async()=>{
   const {WebHistoryStorage}=(globalThis as unknown as {historyTest:Record<string,any>}).historyTest;
   const id=crypto.randomUUID(),other=crypto.randomUUID(),name='history-test',first=new WebHistoryStorage(id,name);
   await first.save({accountId:id,phase:'active',entries:[]});await first.close();
   const reopened=new WebHistoryStorage(id,name);const initial=await reopened.load();
   const db=await new Promise<IDBDatabase>((r,j)=>{const q=indexedDB.open(name,1);q.onsuccess=()=>r(q.result);q.onerror=()=>j(q.error);});
   const damage=async(both:boolean)=>new Promise<void>((r,j)=>{const tx=db.transaction('histories','readwrite'),s=tx.objectStore('histories'),q=s.get(id);q.onsuccess=()=>{const value=q.result;value.primary='broken';if(both)value.backup='broken';s.put(value,id);};tx.oncomplete=()=>r();tx.onabort=()=>j(tx.error);});
   await damage(false);const recovered=await reopened.load();await damage(true);
   let isolated=false,blocked=false;try{await reopened.load();}catch{isolated=!!reopened.notice;}try{await reopened.save(initial);}catch{blocked=true;}
   const separate=new WebHistoryStorage(other,name);await separate.save({accountId:other,phase:'active',entries:[]});const independent=(await separate.load()).accountId===other;
   await separate.close();await reopened.close();db.close();return {recovered:JSON.stringify(initial)===JSON.stringify(recovered),isolated,blocked,independent};
  });expect(result).toEqual({recovered:true,isolated:true,blocked:true,independent:true});
 }finally{await browser.close();await new Promise<void>((r,j)=>server.close(e=>e?j(e):r()));}
},30000);
