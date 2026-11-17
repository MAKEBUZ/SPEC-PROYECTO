import {it,expect} from 'vitest';
import {basename} from 'node:path';
import {installerAction} from '../../apps/desktop/src/main/installer-events.js';
it('only installer lifecycle events create or remove shortcuts, without opening user files',()=>{
 const exe='C:/Program Files/PATRONAJE/app-0.1.0/PATRONAJE.exe';
 for(const event of ['--squirrel-install','--squirrel-updated'])expect(installerAction(event,exe)?.args).toEqual(['--createShortcut','PATRONAJE.exe']);
 const removal=installerAction('--squirrel-uninstall',exe)!;expect(removal.args).toEqual(['--removeShortcut','PATRONAJE.exe']);expect(basename(removal.updater)).toBe('Update.exe');
 expect(installerAction('--squirrel-obsolete',exe)).toBeNull();
 expect(installerAction('--squirrel-firstrun',exe)).toBeUndefined();expect(installerAction(undefined,exe)).toBeUndefined();
});
