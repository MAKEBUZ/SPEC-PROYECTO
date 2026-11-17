import { it,expect } from 'vitest';
import { _electron,expect as ui } from '@playwright/test';
import { mkdtemp,rm,readFile } from 'node:fs/promises';
import { join,resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { DocumentWriter } from '../../apps/desktop/src/main/documents/save.js';
import { windowsAdapter } from '../../apps/desktop/src/main/documents/windows-adapter.js';
it('offers an interrupted native save on fresh Electron startup and restores only as unsaved',async()=>{
 const root=await mkdtemp(join(tmpdir(),'patron-save-restart-')),profile=join(root,'profile'),path=join(root,'pattern.patron');
 const env=Object.fromEntries(Object.entries(process.env).filter((p):p is [string,string]=>p[1]!==undefined));delete env.ELECTRON_RUN_AS_NODE;
 const document={formatVersion:1 as const,documentId:randomUUID(),revisionId:'0'.repeat(64),units:'mm' as const,pieces:[],preparations:[]};
 const adapter=windowsAdapter(resolve('apps/desktop/native/build/Release/file_replace.node'));
 adapter.flush=async()=>{throw Error('Injected interruption after native move');};
 await expect(new DocumentWriter(join(profile,'document-writes'),adapter).save({path,snapshot:document,expected:null})).rejects.toThrow('Injected');
 const original=await readFile(path);
 const app=await _electron.launch({executablePath:resolve('node_modules/electron/dist/electron.exe'),args:[resolve('dist/tests/desktop/cad-host.js'),`--user-data-dir=${profile}`],env});
 try{
  const page=await app.firstWindow();await page.getByRole('button',{name:'Recuperación local',exact:true}).click();
  const row=page.getByRole('listitem').filter({hasText:document.documentId});await ui(row).toContainText('guardado interrumpido');await ui(row).toContainText('destino coincide');
  page.once('dialog',d=>void d.accept());await row.getByRole('button',{name:'Recuperar copia',exact:true}).click();
  await expect.poll(async()=>JSON.parse((await page.getByTestId('cad-snapshot').textContent())!).documentId).toBe(document.documentId);
  await page.getByRole('button',{name:'Recuperación local',exact:true}).click();await ui(page.getByRole('button',{name:'Recuperar copia',exact:true}).first()).toBeDisabled();
  expect(await readFile(path)).toEqual(original);
 }finally{const closed=app.waitForEvent('close');await app.evaluate(({app})=>app.exit(0)).catch(()=>{});await closed;await rm(root,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
},30000);
