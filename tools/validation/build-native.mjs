import { spawnSync } from 'node:child_process';
import { resolve,dirname,delimiter } from 'node:path';
if(process.platform!=='win32'||process.arch!=='x64')throw Error('El adaptador requiere Windows x64.');
// Downloads build headers if necessary; never deploys or accesses AWS.
const result=spawnSync(process.execPath,[resolve('node_modules/node-gyp/bin/node-gyp.js'),'rebuild','--arch=x64','--devdir',resolve('.local/node-gyp'),'--directory',resolve('apps/desktop/native')],{
  stdio:'inherit',env:{...process.env,PATH:dirname(process.execPath)+delimiter+process.env.PATH},windowsHide:true,
});
if(result.error)throw result.error;process.exitCode=result.status??1;
