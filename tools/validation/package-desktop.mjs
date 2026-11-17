import {cp,mkdir,readFile,writeFile,rename,realpath} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {resolve,join,dirname,relative} from 'node:path';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {api} from '@electron-forge/core';

if(process.platform!=='win32'||process.arch!=='x64')throw Error('Windows x64 required');
const root=resolve('.'),run=resolve('.local','windows-package',randomUUID()),out=join(run,'out');
const runtime=join(out,'PATRONAJE-win32-x64'),app=join(runtime,'resources','app');
const electron=JSON.parse(await readFile('node_modules/electron/package.json','utf8'));
const desktop=JSON.parse(await readFile('apps/desktop/package.json','utf8'));
if((await readFile('node_modules/electron/dist/version','utf8')).trim().replace(/^v/,'')!==electron.version)throw Error('ELECTRON_VERSION_MISMATCH');
const build=spawnSync(process.execPath,['tools/validation/build-desktop.mjs'],{stdio:'inherit',windowsHide:true});
if(build.status!==0)throw Error('DESKTOP_BUILD_FAILED');
await mkdir(app,{recursive:true});
await cp('node_modules/electron/dist',runtime,{recursive:true});
await rename(join(runtime,'electron.exe'),join(runtime,'PATRONAJE.exe'));
// Renaming electron.exe alone leaves Electron in Windows file/process properties.
const branding=spawnSync(resolve('node_modules/electron-winstaller/vendor/rcedit.exe'),[
 join(runtime,'PATRONAJE.exe'),'--set-version-string','ProductName','PATRONAJE',
 '--set-version-string','FileDescription','PATRONAJE','--set-version-string','InternalName','PATRONAJE',
 '--set-version-string','OriginalFilename','PATRONAJE.exe','--set-version-string','CompanyName','PATRONAJE',
 '--set-file-version',desktop.version,'--set-product-version',desktop.version,
],{stdio:'inherit',windowsHide:true});
if(branding.status!==0)throw Error('WINDOWS_BRANDING_FAILED');
await cp('dist/apps/desktop/src',join(app,'dist/apps/desktop/src'),{recursive:true});
await cp('dist/packages',join(app,'dist/packages'),{recursive:true});
// Only explicitly required desktop assets: never copy .local, credentials or API data.
for(const path of ['apps/desktop/native/build/Release/file_replace.node','.local/assets/NotoSans-Regular.ttf','.local/assets/NotoSans-LICENSE']){
 await mkdir(dirname(join(app,path)),{recursive:true});await cp(path,join(app,path));
}
const copied=new Map();
async function dependency(name,from=root,optional=false){
 const paths=createRequire(join(from,'package.json')).resolve.paths(name)??[];
 const candidate=paths.map(p=>join(p,name)).find(p=>existsSync(join(p,'package.json')));
 if(!candidate){if(optional)return;throw Error('MISSING_RUNTIME_DEPENDENCY:'+name);}
 const directory=await realpath(candidate),metadata=JSON.parse(await readFile(join(directory,'package.json'),'utf8'));
 const target=relative(root,directory);if(target.startsWith('..')||!target.startsWith('node_modules'))throw Error('EXTERNAL_DEPENDENCY');if(copied.has(target))return;
 copied.set(target,metadata.version);
 await cp(directory,join(app,target),{recursive:true,filter:path=>!path.slice(directory.length).split(/[\\/]/).includes('node_modules')});
 for(const child of Object.keys(metadata.dependencies??{}))await dependency(child,directory);
 for(const child of Object.keys(metadata.optionalDependencies??{}))await dependency(child,directory,true);
}
for(const name of ['pdfkit','pdfjs-dist','@resvg/resvg-wasm'])await dependency(name);
const config=resolve('dist/apps/desktop/forge.config.js');
await writeFile(join(app,'package.json'),JSON.stringify({name:'patronaje',productName:'PATRONAJE',version:desktop.version,description:'CAD de patronaje digital',author:'PATRONAJE',type:'module',main:'dist/apps/desktop/src/main/bootstrap.js',devDependencies:{electron:electron.version},config:{forge:config}},null,2));
// This package's reviewed install script only selects its bundled host 7-Zip.
const setup=spawnSync(process.execPath,['script/select-7z-arch.js'],{cwd:resolve('node_modules/electron-winstaller'),stdio:'inherit',windowsHide:true});
if(setup.status!==0)throw Error('WINSTALLER_SETUP_FAILED');
const results=await api.make({dir:app,outDir:out,platform:'win32',arch:'x64',fromPackage:true,interactive:false});
const artifacts=[];
for(const result of results)for(const path of result.artifacts){const bytes=await readFile(path);artifacts.push({path,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});}
await mkdir('.local/validation',{recursive:true});
await writeFile('.local/validation/windows-package.json',JSON.stringify({runtime,app,electron:electron.version,architecture:'x64',signed:false,dependencies:Object.fromEntries(copied),artifacts},null,2));
console.log(JSON.stringify({runtime,artifacts},null,2));
