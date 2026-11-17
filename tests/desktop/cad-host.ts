import { app } from 'electron';
import { AccountSession } from '../../apps/desktop/src/main/account-session.js';
import { createDesktopWindow } from '../../apps/desktop/src/main/index.js';
// Explicit local test entrypoint. Production bootstrap has no bypass flag.
const account=new AccountSession({load:async()=>({version:1,localEnabled:true,active:null,revocations:[],deletionChecks:[],allPending:null}),save:async()=>{}},{online:()=>false,request:async()=>{throw new Error('No network in CAD fixture');}});
void createDesktopWindow(false,account).then(window=>{window.webContents.setBackgroundThrottling(false);window.showInactive();}).catch(()=>app.exit(1));
app.on('window-all-closed',()=>app.quit());
