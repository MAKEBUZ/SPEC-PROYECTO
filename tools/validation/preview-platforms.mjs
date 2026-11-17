import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
const image='node:24.22.3-bookworm-slim';
function run(command,args){const r=spawnSync(command,args,{encoding:'utf8',timeout:120000,windowsHide:true});if(r.error||r.status!==0)throw Error(r.error?.message??r.stderr);return r.stdout.trim();}
const windows=JSON.parse(run(process.execPath,['tools/validation/preview-profile.mjs']));
const imageId=run('docker',['image','inspect',image,'--format','{{.Id}}']);
const mounts=['dist','node_modules','.local/assets','tools/validation/preview-profile.mjs','package.json'].flatMap(path=>['--mount',`type=bind,source=${resolve(path)},target=/work/${path},readonly`]);
const linux=JSON.parse(run('docker',['run','--rm','--network','none','--read-only',...mounts,'--workdir','/work',image,'node','tools/validation/preview-profile.mjs']));
if(JSON.stringify(windows)!==JSON.stringify(linux))throw Error('PREVIEW_PLATFORM_MISMATCH');
await mkdir('.local/validation',{recursive:true});
await writeFile('.local/validation/preview-platforms.json',JSON.stringify({image,imageId,windows,linux},null,2));
console.log(JSON.stringify({profile:windows.profile,cases:windows.hashes.length,identical:true,node:windows.node,imageId}));
