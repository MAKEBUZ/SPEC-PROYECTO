// Local demonstration only. Never packaged into the production installer.
import {app,net} from 'electron';
import {resolve,join} from 'node:path';
import {mkdirSync} from 'node:fs';
import {AccountSession} from '../../dist/apps/desktop/src/main/account-session.js';
import {ProtectedAccountStore} from '../../dist/apps/desktop/src/main/account-store.js';
import {windowsAccountCrypto,protectAccountDirectory} from '../../dist/apps/desktop/src/main/account-runtime.js';
import {HttpsAccountRemote} from '../../dist/apps/desktop/src/main/account-remote.js';
import {createDesktopWindow} from '../../dist/apps/desktop/src/main/index.js';

const base=process.env.PATRON_DEMO_API,run=process.env.PATRON_DEMO_RUN;
if(!base||!/^http:\/\/127\.0\.0\.1:\d+$/.test(base)||!run||!/^[a-f0-9-]{36}$/.test(run))throw Error('DEMO_LOCAL_ONLY');
const directory=resolve('.local/demo',run,'cad');mkdirSync(directory,{recursive:true});
app.setPath('userData',directory);app.setPath('sessionData',directory);
delete process.env.PATRON_API_ORIGIN;
// Same production remote contract; only transport is redirected to loopback.
const remote=new HttpsAccountRemote('https://patron.example.invalid',()=>net.isOnline(),(input,init)=>{
 const url=new URL(String(input));
 if(url.origin!=='https://patron.example.invalid')throw Error('DEMO_ORIGIN');
 return fetch(base+url.pathname+url.search,init);
});
const account=new AccountSession(new ProtectedAccountStore(join(directory,'protected'),windowsAccountCrypto,protectAccountDirectory),remote);
void createDesktopWindow(true,account).catch(error=>{console.error(error);app.exit(1);});
app.on('window-all-closed',()=>app.quit());
