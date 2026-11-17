import { contextBridge, ipcRenderer } from 'electron';
const closeListeners=new Set<(token:string)=>void>();let pendingClose:string|undefined;
ipcRenderer.on('patron:close-request',(_event,token:unknown)=>{if(typeof token!=='string')return;if(!closeListeners.size)pendingClose=token;else for(const listener of closeListeners)listener(token);});

// Bundled as CJS for the sandboxed Electron preload. No filesystem or shell API.
const methods = new Set(['account.action', 'account.status', 'account.login', 'account.logout', 'account.logoutAll', 'account.refresh', 'account.reconnect', 'window.closeApproved', 'window.closeCancelled', 'document.open', 'document.register', 'document.confirmLeave', 'document.confirmTrash', 'document.save', 'publication.prepare', 'publication.pdfs', 'publication.action', 'publication.conflict', 'publication.resolveConflict', 'recovery.inspect', 'recovery.capture', 'recovery.restore', 'recovery.discard', 'export.generate', 'export.cancel', 'export.status', 'export.confirmSave', 'document.trash']);
contextBridge.exposeInMainWorld('patron', Object.freeze({
  onCloseRequested:(listener:(token:string)=>void)=>{if(typeof listener!=='function')throw Error('Suscripción inválida');closeListeners.add(listener);if(pendingClose){const token=pendingClose;pendingClose=undefined;queueMicrotask(()=>listener(token));}return ()=>{closeListeners.delete(listener);};},
  request: (request: { requestId: string; method: string }) => {
    if (!request || !methods.has(request.method)) return Promise.reject(new Error('Operación no admitida.'));
    return ipcRenderer.invoke('patron:request', request);
  },
}));
