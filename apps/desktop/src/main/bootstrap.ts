import { app, BrowserWindow, shell } from 'electron';
import {unlink} from 'node:fs/promises';
import {migrateLegacyShortcuts} from './shortcut-migration.js';
import { createDesktopWindow } from './index.js';
import {handleInstallerEvent,installerAction} from './installer-events.js';
app.setName('PATRONAJE');
app.setAppUserModelId('com.squirrel.PATRONAJE.PATRONAJE');
if(installerAction(process.argv[1],process.execPath)!==undefined){
 void handleInstallerEvent(process.argv[1],process.execPath).then(async()=>{
  await migrateLegacyShortcuts(process.argv[1],process.execPath,app.getPath('appData'),app.getPath('desktop'),{read:file=>shell.readShortcutLink(file),remove:unlink});
  app.quit();
 }).catch(()=>app.exit(1));
}else if(!app.requestSingleInstanceLock()){
 app.quit();
}else{
 let activationPending=false;
 const activate=()=>{
  const window=BrowserWindow.getAllWindows().find(w=>!w.isDestroyed());
  if(!window){activationPending=true;return;}
  if(window.isMinimized())window.restore();window.show();window.focus();activationPending=false;
 };
 app.on('second-instance',activate);
 void createDesktopWindow().then(()=>{if(activationPending)activate();}).catch(()=>app.exit(1));
}
app.on('window-all-closed', () => app.quit());
