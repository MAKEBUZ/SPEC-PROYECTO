import { it,expect } from 'vitest';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { chromium } from '@playwright/test';
it('compacts IndexedDB atomically and rejects restoration or new writes above deletion evidence',async()=>{
 const files=new Map<string,string>();
 files.set('/storage.js',(await readFile('dist/apps/web/src/operations/storage.js','utf8')).replaceAll('../../../../packages/document/src/operations/journal.js','/journal.js'));
 files.set('/journal.js',(await readFile('dist/packages/document/src/operations/journal.js','utf8')).replaceAll('../../../contracts/src/validation.js','/validation.js'));
 files.set('/validation.js',await readFile('dist/packages/contracts/src/validation.js','utf8'));
 const server=createServer((req,res)=>{const script=files.get(req.url??'');res.setHeader('Content-Type',script?'text/javascript':'text/html');res.end(script??'<html><body>Local journal test</body></html>');});
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const address=server.address();if(!address||typeof address==='string')throw Error();
 const executablePath=['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(existsSync);if(!executablePath)throw Error('Missing Edge');
 const browser=await chromium.launch({executablePath,headless:true});
 try{
  const page=await browser.newPage();await page.goto(`http://127.0.0.1:${address.port}`);
  await page.addScriptTag({type:'module',content:"import {WebJournalStorage} from '/storage.js'; import {OperationJournal,journalKey} from '/journal.js'; globalThis.journalTest={WebJournalStorage,OperationJournal,journalKey};"});
  await page.waitForFunction(()=>Object.hasOwn(globalThis,'journalTest'));
  const result=await page.evaluate(async()=>{
   const {WebJournalStorage,OperationJournal,journalKey}=(globalThis as unknown as {journalTest:Record<string,any>}).journalTest;
   const name='compaction-test',storage=new WebJournalStorage(name),journal=new OperationJournal(storage),accountId=crypto.randomUUID(),operationId=crypto.randomUUID(),key=journalKey(accountId,operationId);
   const op={accountId,operationId,requestHash:'a'.repeat(64),type:'test',state:'pending',pause:false,retryLevel:0,deadline:null,status:'ready',scopes:[]};
   await journal.create(op);const old=await storage.read(key);
   const damageDb=await new Promise<IDBDatabase>((resolve,reject)=>{const q=indexedDB.open(name,3);q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});
   await new Promise<void>((resolve,reject)=>{const tx=damageDb.transaction('generations','readwrite');tx.objectStore('generations').put(['broken'],key);tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error);});
   damageDb.close();const recovered=(await journal.inspect(accountId,true)).entries.length===1;
   await journal.update(accountId,operationId,(r:object)=>({...r,state:'closed',closedAt:0}));await journal.update(accountId,operationId,()=>null);await journal.compact(accountId,operationId);
   const empty=(await storage.keys()).length===0;
   const db=await new Promise<IDBDatabase>((resolve,reject)=>{const q=indexedDB.open(name,3);q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});
   await new Promise<void>((resolve,reject)=>{const tx=db.transaction('generations','readwrite');tx.objectStore('generations').put(old,key);tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error);});db.close();
   const hidden=(await journal.inspect(accountId,true)).entries.length===0;
   await journal.compact(accountId,operationId);let rejected=false;try{await journal.create(op);}catch{rejected=true;}
   await storage.close();return {empty,hidden,rejected,recovered};
  });expect(result).toEqual({empty:true,hidden:true,rejected:true,recovered:true});
 }finally{await browser.close();await new Promise<void>((r,j)=>server.close(e=>e?j(e):r()));}
},30000);

