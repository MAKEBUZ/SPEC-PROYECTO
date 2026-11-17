import { createRequire } from 'node:module';
import { resolve,relative,isAbsolute } from 'node:path';
import { LocalDocumentError,type ReplacementAdapter } from './save.js';
interface VolumeInfo {volume:string;serial:number;filesystem:string;readOnly:boolean}
interface NativeFiles {checkPath(path:string):VolumeInfo;replace(destination:string,temporary:string,backup:string):void;create(destination:string,temporary:string):void;flush(path:string):void}
export function validateLocalPath(path:string,roots:string[]=[]){
  if(!/^[A-Za-z]:[\\/]/.test(path)||/[\x00-\x1f<>"|?*]/.test(path)||path.slice(2).includes(':'))throw new LocalDocumentError('ACCESS_DENIED');
  const components=path.slice(3).split(/[\\/]/);
  if(components.some(p=>!p||p==='.'||p==='..'||/[. ]$/.test(p)||/^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(p)))throw new LocalDocumentError('ACCESS_DENIED');
  const full=resolve(path);
  for(const root of roots){const r=relative(resolve(root),full);if(r===''||!r.startsWith('..')&&!isAbsolute(r))throw new LocalDocumentError('ACCESS_DENIED');}
  return full;
}
export function windowsAdapter(modulePath:string):ReplacementAdapter{
  let native:NativeFiles|undefined;
  const binding=()=>{
    if(process.platform!=='win32')throw new LocalDocumentError('STORAGE_UNAVAILABLE');
    if(!native){try{native=createRequire(import.meta.url)(modulePath) as NativeFiles;if(['checkPath','replace','create','flush'].some(k=>typeof (native as unknown as Record<string,unknown>)[k]!=='function'))throw Error();}catch{native=undefined;throw new LocalDocumentError('NATIVE_ADAPTER_UNAVAILABLE');}}
    return native;
  };
  const inspect=(path:string)=>{
    const full=validateLocalPath(path,[process.env.OneDrive,process.env.OneDriveConsumer,process.env.OneDriveCommercial].filter((r):r is string=>!!r));
    const info=binding().checkPath(full);
    if(!info||!info.volume||!info.filesystem||!Number.isInteger(info.serial))throw new LocalDocumentError('STORAGE_UNAVAILABLE');
    return info;
  };
  return {
    assertSupported:async path=>{inspect(path);},
    assertWritable:async path=>{if(inspect(path).readOnly)throw new LocalDocumentError('ACCESS_DENIED');},
    volume:async path=>{const v=inspect(path);return `${v.volume}:${v.serial}:${v.filesystem}`;},
    replace:async(...args)=>binding().replace(...args),create:async(...args)=>binding().create(...args),flush:async path=>binding().flush(path),
  };
}
