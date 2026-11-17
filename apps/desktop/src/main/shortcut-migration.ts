import {win32 as path} from 'node:path';
export interface ShortcutMigrationPorts {
 read(file:string):{target:string};
 remove(file:string):Promise<void>;
}
/** Remove only known legacy shortcuts that point to this installation, after
 * the replacement shortcut exists. Never delete folders or unrelated Electron apps. */
export async function migrateLegacyShortcuts(event:string|undefined,executable:string,appData:string,desktop:string,ports:ShortcutMigrationPorts){
 if(!['--squirrel-install','--squirrel-updated'].includes(event??''))return;
 if(path.basename(executable).toLowerCase()!=='patronaje.exe'||!/^app-\d/.test(path.basename(path.dirname(executable))))return;
 const expected=path.resolve(path.dirname(executable),'..','PATRONAJE.exe').toLowerCase();
 const programs=path.join(appData,'Microsoft','Windows','Start Menu','Programs');
 const belongs=(file:string)=>{try{return path.resolve(ports.read(file).target).toLowerCase()===expected;}catch{return false;}};
 if(!belongs(path.join(programs,'PATRONAJE','PATRONAJE.lnk')))return;
 for(const file of [path.join(programs,'GitHub, Inc','Electron.lnk'),path.join(desktop,'Electron.lnk')]){
  if(belongs(file))await ports.remove(file);
 }
}
