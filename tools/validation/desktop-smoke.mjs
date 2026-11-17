import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const electron = resolve('node_modules/electron/dist/electron.exe');
if (!existsSync(electron)) {
  console.error('Falta Electron. Ejecuta primero node node_modules/electron/install.js; esta prueba no descarga binarios automáticamente.');
  process.exit(1);
}
const expected = JSON.parse(readFileSync('node_modules/electron/package.json', 'utf8')).version;
if (readFileSync('node_modules/electron/dist/version', 'utf8').trim().replace(/^v/, '') !== expected) {
  console.error('El runtime Electron no coincide con la dependencia fijada.'); process.exit(1);
}
const build = spawnSync(process.execPath, ['tools/validation/build-desktop.mjs'], { stdio: 'inherit' });
if (build.status !== 0) process.exit(build.status ?? 1);
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
const run = spawnSync(electron, ['dist/tests/desktop/foundation-smoke.js'], { stdio: 'inherit', env, timeout: 60000, windowsHide: true });
if (run.error) console.error(run.error.message);
process.exit(run.status ?? 1);
