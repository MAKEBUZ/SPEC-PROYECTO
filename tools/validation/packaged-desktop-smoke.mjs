import {_electron,expect} from '@playwright/test';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
const manifest=JSON.parse(await readFile(process.argv[2]??'.local/validation/windows-package.json','utf8'));
const profile=resolve('.local','windows-smoke',randomUUID());await mkdir(profile,{recursive:true});
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;delete env.PATRON_API_ORIGIN;
const cad=await _electron.launch({executablePath:join(manifest.runtime,'PATRONAJE.exe'),args:['--user-data-dir='+profile],cwd:manifest.runtime,env,timeout:30000});
try{
 const page=await cad.firstWindow();await expect(page.getByRole('heading',{name:'Iniciar sesión',exact:true})).toBeVisible();
 await cad.evaluate(({app,BrowserWindow})=>{globalThis.secondLaunches=0;app.on('second-instance',()=>{globalThis.secondLaunches++;});BrowserWindow.getAllWindows()[0].minimize();});
 for(let attempt=1;attempt<=2;attempt++){
  await new Promise((accept,reject)=>{
   const child=spawn(join(manifest.runtime,'PATRONAJE.exe'),['--user-data-dir='+profile],{cwd:manifest.runtime,env,windowsHide:true,stdio:'ignore'});
   const timer=setTimeout(()=>{child.kill();reject(Error('SECOND_INSTANCE_DID_NOT_EXIT'));},15000);
   child.once('error',error=>{clearTimeout(timer);reject(error);});child.once('exit',code=>{clearTimeout(timer);code===0?accept():reject(Error('SECOND_INSTANCE_EXIT:'+code));});
  });
  await expect.poll(()=>cad.evaluate(({BrowserWindow,app})=>({count:BrowserWindow.getAllWindows().length,minimized:BrowserWindow.getAllWindows()[0].isMinimized(),visible:BrowserWindow.getAllWindows()[0].isVisible(),title:BrowserWindow.getAllWindows()[0].getTitle(),name:app.getName(),launches:globalThis.secondLaunches}))).toEqual({count:1,minimized:false,visible:true,title:'PATRONAJE',name:'PATRONAJE',launches:attempt});
 }
 const result=await cad.evaluate(async({app,BrowserWindow},{expected})=>{
  const fs=process.getBuiltinModule('fs').promises,path=process.getBuiltinModule('path'),module=process.getBuiltinModule('module');
  for(const window of BrowserWindow.getAllWindows())window.hide();
  if(path.resolve(app.getPath('userData'))!==path.resolve(expected))throw Error('TEST_PROFILE_NOT_ISOLATED');
  const root=app.getAppPath(),require=module.createRequire(path.join(root,'package.json'));
  for(const name of ['pdfkit','pdfjs-dist/legacy/build/pdf.mjs','@resvg/resvg-wasm']){
   const resolved=path.relative(root,require.resolve(name));if(resolved.startsWith('..')||path.isAbsolute(resolved))throw Error('DEPENDENCY_OUTSIDE_PACKAGE:'+name);
  }
  const native=require(path.join(root,'apps/desktop/native/build/Release/file_replace.node'));
  const font=await fs.readFile(path.join(root,'.local/assets/NotoSans-Regular.ttf'));
  const wasm=await fs.readFile(path.join(root,'node_modules/@resvg/resvg-wasm/index_bg.wasm'));
  require('pdfkit');
  require.resolve('pdfjs-dist/legacy/build/pdf.mjs');
  return {packaged:app.isPackaged,version:app.getVersion(),name:app.getName(),secondLaunches:globalThis.secondLaunches,architecture:process.arch,electron:process.versions.electron,userData:app.getPath('userData'),fontBytes:font.length,wasmBytes:wasm.length,nativeExports:Object.keys(native)};
 },{expected:profile});
 if(!result.packaged||result.architecture!=='x64'||result.fontBytes===0||result.nativeExports.length===0)throw Error('INVALID_PACKAGED_RUNTIME');
 await writeFile('.local/validation/windows-package-smoke.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}finally{await cad.close();}
