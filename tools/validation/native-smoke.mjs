import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { mkdir,readFile,writeFile,rm,symlink,unlink } from 'node:fs/promises';
import { resolve,join } from 'node:path';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
if(process.platform!=='win32'||process.arch!=='x64')throw Error('Ensayo exclusivo de Windows x64.');
const file=resolve('apps/desktop/native/build/Release/file_replace.node');
if(!existsSync(file))throw Error('Falta el adaptador compilado. Ejecuta tools/validation/build-native.mjs con las herramientas C++ instaladas.');
const native=createRequire(import.meta.url)(file);
const root=resolve('.local',`native-smoke-${randomUUID()}`);
await mkdir(root,{recursive:true});
try{
  const destination=join(root,'patrón.patron'),temporary=join(root,'nuevo.tmp'),backup=join(root,'anterior.bak');
  const volume=native.checkPath(destination);assert.equal(typeof volume.volume,'string');assert.ok(volume.volume.length>0);assert.equal(Number.isInteger(volume.serial),true);assert.equal(typeof volume.readOnly,'boolean');assert.ok(volume.filesystem.length>0);
  console.log(`Sistema de archivos comprobado: ${volume.filesystem}; solo lectura: ${volume.readOnly}.`);
  assert.throws(()=>native.checkPath('\\\\server\\share\\pattern.patron'));
  assert.throws(()=>native.checkPath(join(root,'missing-directory','pattern.patron')));
  const junction=join(root,'junction');await symlink(root,junction,'junction');
  try{assert.throws(()=>native.checkPath(join(junction,'pattern.patron')));}finally{await unlink(junction);}
  await writeFile(temporary,'first');native.create(destination,temporary);native.flush(destination);
  assert.equal(await readFile(destination,'utf8'),'first');
  await writeFile(temporary,'second');assert.throws(()=>native.create(destination,temporary));
  assert.equal(await readFile(destination,'utf8'),'first');assert.equal(await readFile(temporary,'utf8'),'second');
  native.replace(destination,temporary,backup);native.flush(destination);
  assert.equal(await readFile(destination,'utf8'),'second');assert.equal(await readFile(backup,'utf8'),'first');
  console.log('Adaptador Windows: creación exclusiva, reemplazo, respaldo, flush y rechazo UNC verificados. No valida desconexión USB física.');
}finally{
  // Root is generated beneath the explicit workspace-local test directory.
  assert.equal(root.startsWith(resolve('.local')+String.fromCharCode(92)),true);
  await rm(root,{recursive:true,force:true});
}
