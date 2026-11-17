import { app, BrowserWindow, ipcMain, session, dialog, shell, net, screen } from 'electron';
import {parseDeletionCheckBatch} from '../../../../packages/contracts/src/deletion-check-batch.js';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { CapabilityRegistry } from './ipc-boundary.js';
import { IpcRouter } from './ipc-router.js';
import type { LocalHandlers } from './ipc-router.js';
import { createAccountSession } from './account-runtime.js';
import type { AccountSession } from './account-session.js';
import { RecoveryStore } from './documents/recovery.js';
import { recoveryHandlers } from './documents/recovery-handlers.js';
import { documentHandlers } from './documents/document-handlers.js';
import { windowsAdapter } from './documents/windows-adapter.js';
import { DocumentWriter } from './documents/save.js';
import { SaveJournal } from './documents/save-journal.js';
import { randomUUID } from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {PublicationRuntime} from './publication/runtime.js';
import {PublicationStateStore} from './publication/state-store.js';
import {DesktopJournalStorage} from './operations/storage.js';
import {desktopOperationLifecycle} from './operations/lifecycle.js';
import {DTO} from '../../../../packages/contracts/src/http-dto.js';
import {mutationScopes,resourceMutationQuery,admissionRejection} from '../../../../packages/document/src/operations/mutation-admission.js';
import {parseAccountAction,ACCOUNT_ACTIONS} from '../../../../packages/contracts/src/account-actions.js';
import {exportHandlers} from './print/export-handlers.js';
import {PdfArtifactStore} from './publication/pdf-artifact-store.js';
import {verifyPdfIsolated} from './print/pdf-verifier.js';

app.enableSandbox();
export async function createDesktopWindow(visible = true, accountOverride?: AccountSession): Promise<BrowserWindow> {
  await app.whenReady();
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
  const directory = fileURLToPath(new URL('.', import.meta.url));
  const rendererPath = join(directory, '../renderer/index.html');
  const allowedUrl = pathToFileURL(rendererPath).href;
  const area=screen.getPrimaryDisplay().workAreaSize;
  const window = new BrowserWindow({ title:'PATRONAJE', width:Math.min(1360,area.width),height:Math.min(900,area.height),minWidth:Math.min(760,area.width),minHeight:Math.min(560,area.height),show: false, webPreferences: {
    preload: join(directory, '../preload/index.cjs'), sandbox: true,
    contextIsolation: true, nodeIntegration: false, webSecurity: true,
  } });
  const owner = window.webContents.id;
  // Let the CAD handle undo/redo, while text fields retain Chromium's native
  // editing. An application-menu accelerator must not consume these keystrokes.
  window.webContents.on('before-input-event',(_event,input)=>{
    window.webContents.setIgnoreMenuShortcuts((input.control||input.meta)&&['z','y'].includes(input.key.toLowerCase()));
  });
  const account = accountOverride ?? createAccountSession(app.getPath('userData'));
  await account.initialize().catch(() => undefined); // UI can show storageReady=false, never enable from corrupt state.
  const publicationStore=new PublicationStateStore(new DesktopJournalStorage(join(app.getPath('userData'),'publication-attempts')));
  const operations=desktopOperationLifecycle(join(app.getPath('userData'),'operations'),process.env.PATRON_API_ORIGIN,id=>publicationStore.retireAccount(id));
  account.trackOperations(operations.runtime);
  const publications=new PublicationRuntime(publicationStore,account,operations.runtime);
  operations.attach(window);
  const history=operations.runtime.historyPanel({auth:async()=>{const reply=await account.action('snapshot',undefined),view=(reply.body as {session?:{accountId:string;id:string;accessClass:string;expiresAt:string}}).session;return {accountId:view?.accountId??null,sessionId:view?.id??null,valid:!!view&&view.accessClass==='normal'&&Date.parse(view.expiresAt)>Date.now(),online:net.isOnline()};},query:async op=>{const reply=await account.action('operation',{accountId:op.accountId,operationId:op.operationId,operationType:op.type});if(reply.status>=400)throw {code:(reply.body as {code?:string}).code};return reply.body;}});
  const capabilities=new CapabilityRegistry();
  const adapter=windowsAdapter(join(directory,'../../../../../apps/desktop/native/build/Release/file_replace.node'));
  const handlers: LocalHandlers = recoveryHandlers(new RecoveryStore(join(app.getPath('userData'),'document-recovery')),capabilities,owner,new SaveJournal(join(app.getPath('userData'),'document-writes'),adapter));
  const pdfCatalog=new PdfArtifactStore(join(app.getPath('userData'),'pdf-artifacts'),verifyPdfIsolated);
  const exports=exportHandlers(owner,capabilities,adapter,()=>readFile(join(directory,'../../../../../.local/assets/NotoSans-Regular.ttf')),async()=>{
    const result=await dialog.showSaveDialog(window,{defaultPath:'Patrón.pdf',filters:[{name:'PDF',extensions:['pdf']}]});return result.canceled?null:result.filePath??null;
  },async()=>(await dialog.showMessageBox(window,{type:'question',message:'Guarda el documento antes de generar el PDF.',buttons:['Guardar y continuar','Cancelar'],defaultId:1,cancelId:1,noLink:true})).response===0,pdfCatalog);
  Object.assign(handlers,exports.handlers);
  window.webContents.once('destroyed',()=>{void exports.dispose();});
  Object.assign(handlers,documentHandlers(owner,capabilities,new DocumentWriter(join(app.getPath('userData'),'document-writes'),adapter),adapter,{
    open:async()=>{const r=await dialog.showOpenDialog(window,{properties:['openFile'],filters:[{name:'Patrones',extensions:['patron']}]});return r.canceled?null:r.filePaths[0]??null;},
    save:async currentPath=>{const r=await dialog.showSaveDialog(window,{defaultPath:currentPath??'Patrón.patron',filters:[{name:'Patrones',extensions:['patron']}]});return r.canceled?null:r.filePath??null;},
    overwrite:async name=>(await dialog.showMessageBox(window,{type:'warning',message:`¿Reemplazar «${name}»?`,buttons:['Cancelar','Reemplazar'],defaultId:0,cancelId:0,noLink:true})).response===1,
    confirmTrash:async(name,dirty)=>{
      const buttons=dirty?['Guardar y enviar a papelera','Descartar cambios y enviar a papelera','Cancelar']:['Enviar a papelera','Cancelar'];
      const response=dialog.showMessageBoxSync(window,{type:'warning',title:'Eliminar copia local',message:`¿Enviar «${name}» a la papelera del sistema?`,detail:'Se elimina solo el archivo editable local. Los PDF y el patrón de la cuenta se conservan.',buttons,defaultId:buttons.length-1,cancelId:buttons.length-1,noLink:true});
      return dirty?(response===0?'save':response===1?'discard':'cancel'):(response===0?'trash':'cancel');
    },
  },path=>shell.trashItem(path),async()=>({wasm:await readFile(join(directory,'../../../../../node_modules/@resvg/resvg-wasm/index_bg.wasm')),font:await readFile(join(directory,'../../../../../.local/assets/NotoSans-Regular.ttf'))}),publications,join(app.getPath('userData'),'publication-conflict-backups'),pdfCatalog));
  const chooseLeave=()=>{
    const choice=dialog.showMessageBoxSync(window,{type:'warning',title:'Cambios sin guardar',message:'El documento tiene cambios sin guardar.',detail:'Guardar debe terminar correctamente antes de continuar. La copia de recuperación no sustituye el guardado.',buttons:['Guardar','Descartar cambios','Cancelar'],defaultId:2,cancelId:2,noLink:true});
    return choice===0?'save':choice===1?'discard':'cancel';
  };
  handlers['document.confirmLeave']=async request=>({requestId:request.requestId,status:'success',data:{choice:chooseLeave()}});
  let closeToken:string|undefined,closeApproved=false;
  window.on('close',event=>{
    if(closeApproved)return;
    event.preventDefault();if(!closeToken){closeToken=randomUUID();window.webContents.send('patron:close-request',closeToken);}
  });
  // The renderer rechecks its version at the final unload. Never override a
  // fresh prevention caused by edits arriving after the close approval.
  window.webContents.on('will-prevent-unload',()=>{closeApproved=false;closeToken=undefined;void operations.runtime.start(!!process.env.PATRON_API_ORIGIN&&net.isOnline());});
  for(const method of ['window.closeApproved','window.closeCancelled'] as const)handlers[method]=async request=>{
    if(!closeToken||request.closeToken!==closeToken)return {requestId:request.requestId,status:'error',error:{code:'ACCESS_DENIED',message:'La solicitud de cierre ya no está vigente.'}};
    closeToken=undefined;if(method==='window.closeApproved'){await operations.runtime.interrupt('close');closeApproved=true;setImmediate(()=>window.close());}
    return {requestId:request.requestId,status:'success',data:{accepted:true}};
  };
  const actions = {
    'account.action': async (request: { [field: string]: unknown }) => {
      const action=request.action as string,epoch=operations.runtime.capture();
      if(action==='history')return {status:200,body:await history.dispatch(request.body)};
      const body=request.body as Record<string,unknown>|undefined;
      if(body?.retryOf!==undefined){const retry=await history.retry(body.retryOf as string),type=action==='localLogout'?'logout':action==='localLogoutAll'?'revokeAll':action;if(retry.type!==type)throw Error('RETRY_UNAVAILABLE');}
      const isMutation=!!body&&typeof body.operationId==='string'&&(ACCOUNT_ACTIONS as readonly string[]).includes(action);
      if(isMutation)parseAccountAction({action,body});
      const snapshot=isMutation||action==='operation'?await account.action('snapshot',undefined):undefined;
      const actor=(snapshot?.body as {session?:{accountId:string}}|undefined)?.session?.accountId;
      if(actor&&isMutation){
        let scope:unknown;
        try{
          if(!net.isOnline())throw Error('MUTATION_NOT_SENT');
          const query=resourceMutationQuery(action,body!);
          if(query){const response=await account.action('resourceScope',query);if(response.status>=400)return response;scope=response.body;}
        }catch{return admissionRejection(Error('MUTATION_NOT_SENT'),body!.operationId as string)!;}
        try{await operations.runtime.beginMutation(actor,action,body!,mutationScopes(actor,action,body!,scope));}
        catch(error){const rejected=admissionRejection(error,body!.operationId as string);if(rejected)return rejected;throw error;}
      }
      const reply=await account.action(action,request.body);
      if(actor&&isMutation&&reply.status<400)await operations.runtime.acceptOperation(actor,action,reply.body);
      if(actor&&action==='operation'&&reply.status<400){const result=DTO.OperationView.parse(reply.body);if(result.state==='resolved'&&result.operationId===body?.operationId&&result.operationType===body?.operationType)await operations.runtime.acceptOperation(actor,result.operationType,{operationId:result.operationId,state:result.state,outcome:result.outcome,confirmedAt:result.confirmedAt,data:{}});}
      if(reply.status<400&&action==='checks')await operations.runtime.acceptDeletion(parseDeletionCheckBatch(reply.body).rows,epoch);
      if(reply.status<400&&snapshot&&['deleteAccount','deletionCredential'].includes(action)){
        const result=DTO.MutationResult.parse(reply.body),view=(snapshot.body as {session?:{accountId:string}}).session;
        if(view&&result.state==='resolved'&&result.outcome==='success')await operations.runtime.rememberDeletion(view.accountId,(result.data as {requestId:string}).requestId);
      }
      return reply;
    },
    'account.status': async () => ({...account.status(),maintenanceNotice:operations.runtime.notice}),
    'account.login': async (request: { [field: string]: unknown }) => account.login(request.email as string, request.password as string),
    'account.logout': async () => account.logout(),
    'account.logoutAll': async () => account.logoutAll(true),
    'account.refresh': async () => account.refresh(),
    'account.reconnect': async () => account.reconnect(),
  } as const;
  for (const method of Object.keys(actions) as (keyof typeof actions)[]) handlers[method] = async request => {
    try { return { requestId: request.requestId, status: 'success', data: await actions[method](request) }; }
    catch { return { requestId: request.requestId, status: 'error', error: { code: 'ACCOUNT_UNAVAILABLE', message: 'No se pudo completar la operación de cuenta. Comprueba la conexión y el almacenamiento protegido.' } }; }
  };
  const router = new IpcRouter(capabilities, handlers, () => account.status().localEnabled);
  let refreshing = false;
  const retry = async () => { if (refreshing) return; refreshing = true; try { await account.reconnect();await publications.tick(); } catch { /* Keep pending state, no secret logging. */ } finally { refreshing = false; } };
  const timer = setInterval(() => { void retry(); }, 15000); timer.unref();
  void retry();
  ipcMain.handle('patron:request', (event, input: unknown) => router.dispatch(
    input, event.sender.id, event.senderFrame?.url ?? '', allowedUrl,
    event.sender.id === owner && event.senderFrame === window.webContents.mainFrame,
  ));
  window.webContents.once('destroyed', () => { clearInterval(timer); router.release(owner); ipcMain.removeHandler('patron:request'); });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.webContents.on('will-attach-webview', event => event.preventDefault());
  if (visible) window.once('ready-to-show', () => window.show());
  await window.loadFile(rendererPath);
  return window;
}
