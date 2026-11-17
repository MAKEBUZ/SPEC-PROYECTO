import {basename,dirname,resolve} from 'node:path';
import {spawn} from 'node:child_process';

export function installerAction(event:string|undefined,executable:string):{updater:string;args:string[]}|null|undefined{
 if(event==='--squirrel-obsolete')return null;
 if(!['--squirrel-install','--squirrel-updated','--squirrel-uninstall'].includes(event??''))return undefined;
 return {updater:resolve(dirname(executable),'..','Update.exe'),args:[event==='--squirrel-uninstall'?'--removeShortcut':'--createShortcut',basename(executable)]};
}
/** Installer invocations do not open the CAD or touch user documents. */
export async function handleInstallerEvent(event:string|undefined,executable:string):Promise<boolean>{
 const action=installerAction(event,executable);if(action===undefined)return false;if(action===null)return true;
 await new Promise<void>((accept,reject)=>{
  const child=spawn(action.updater,action.args,{windowsHide:true,stdio:'ignore'});
  child.once('error',reject);child.once('exit',code=>code===0?accept():reject(Error('INSTALLER_SHORTCUT_FAILED')));
 });return true;
}
