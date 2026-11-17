import {app,dialog,net} from 'electron';
import {resolve,join} from 'node:path';
import {mkdirSync,writeFileSync} from 'node:fs';
import {AccountSession} from '../../apps/desktop/src/main/account-session.js';
import {ProtectedAccountStore} from '../../apps/desktop/src/main/account-store.js';
import {windowsAccountCrypto,protectAccountDirectory} from '../../apps/desktop/src/main/account-runtime.js';
import {HttpsAccountRemote} from '../../apps/desktop/src/main/account-remote.js';
import {createDesktopWindow} from '../../apps/desktop/src/main/index.js';
const base=process.env.PATRON_E2E_API,run=process.env.PATRON_E2E_RUN;
if(!base||!/^http:\/\/127\.0\.0\.1:\d+\/v1$/.test(base)||!run||!/^[a-f0-9-]{36}$/.test(run))throw Error('Invalid local fixture');
const directory=resolve('.local','publication-e2e',run);mkdirSync(directory,{recursive:true});app.setPath('userData',directory);app.setPath('sessionData',directory);
delete process.env.PATRON_API_ORIGIN;
const filename=join(directory,'documento.patron');
// Only the native file picker is substituted; writer, saved capability, IPC,
// credentials, production transport and server remain real.
dialog.showSaveDialog=async()=>({canceled:false,filePath:filename});
dialog.showOpenDialog=async()=>({canceled:false,filePaths:[filename]});
let dropCommit=process.env.PATRON_E2E_DROP_COMMIT==='1';
const remote=new HttpsAccountRemote('https://patron.example.invalid',()=>net.isOnline(),async(input,init)=>{
 const u=new URL(String(input)),response=await fetch(base+u.pathname.slice(3)+u.search,init);
 if(dropCommit&&init?.method==='POST'&&/\/publications\/[a-f0-9-]+\/commit$/.test(u.pathname)&&response.ok){
  dropCommit=false;await response.arrayBuffer();writeFileSync(join(directory,'commit-response-dropped'),'accepted');throw Error('Injected lost commit response');
 }
 return response;
});
const account=new AccountSession(new ProtectedAccountStore(join(directory,'protected'),windowsAccountCrypto,protectAccountDirectory),remote);
void createDesktopWindow(false,account).catch(error=>{console.error(error);app.exit(1);});
app.on('window-all-closed',()=>app.quit());
