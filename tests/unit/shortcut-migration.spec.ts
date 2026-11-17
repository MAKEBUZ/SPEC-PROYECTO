import {it,expect} from 'vitest';
import {migrateLegacyShortcuts} from '../../apps/desktop/src/main/shortcut-migration.js';
const exe='C:\\Local\\PATRONAJE\\app-0.1.1\\PATRONAJE.exe',target='C:\\Local\\PATRONAJE\\PATRONAJE.exe';
const good='C:\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs\\PATRONAJE\\PATRONAJE.lnk';
const old='C:\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs\\GitHub, Inc\\Electron.lnk';
const desktop='C:\\Desktop\\Electron.lnk';
async function run(event:string,links:Record<string,string>){const removed:string[]=[];await migrateLegacyShortcuts(event,exe,'C:\\Roaming','C:\\Desktop',{read:file=>{if(!links[file])throw Error('missing');return {target:links[file]!};},remove:async file=>{removed.push(file);}});return removed;}
it.each(['--squirrel-install','--squirrel-updated'])('migrates matching legacy links only after replacement exists: %s',async event=>{
 expect(await run(event,{[good]:target,[old]:target,[desktop]:target})).toEqual([old,desktop]);
});
it('preserves unrelated Electron shortcuts and directories',async()=>{
 expect(await run('--squirrel-updated',{[good]:target,[old]:'C:\\Other\\Electron.exe',[desktop]:target})).toEqual([desktop]);
});
it('does not remove anything without a valid replacement or outside install/update',async()=>{
 expect(await run('--squirrel-updated',{[old]:target})).toEqual([]);
 expect(await run('--squirrel-updated',{[good]:'C:\\Other\\PATRONAJE.exe',[old]:target})).toEqual([]);
 expect(await run('--squirrel-uninstall',{[good]:target,[old]:target})).toEqual([]);
});
