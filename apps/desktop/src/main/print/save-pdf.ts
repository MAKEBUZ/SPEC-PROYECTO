import {readFile,rm} from 'node:fs/promises';
import {dirname,join,extname,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {exclusiveWrite,identity,sha256,type FileIdentity,type ReplacementAdapter} from '../documents/save.js';
/** Only a verified PDF reaches this main-process writer. Temporary bytes are
 * never reported as an exported PDF; existing destinations retain a backup. */
export async function saveVerifiedPdf(path:string,bytes:Uint8Array,expected:FileIdentity|null,adapter:ReplacementAdapter,cancelled:()=>boolean){
 path=resolve(path);if(extname(path).toLowerCase()!=='.pdf')throw Error('PDF_EXTENSION_REQUIRED');
 await adapter.assertSupported(path);await adapter.assertWritable?.(path);
 const volume=await adapter.volume?.(path),same=()=>identity(path).then(now=>JSON.stringify(now)===JSON.stringify(expected));
 if(!await same())throw Error('EXTERNAL_FILE_CHANGED');
 const id=randomUUID(),temporary=join(dirname(path),`.patron-pdf-${id}.tmp`),backup=join(dirname(path),`.patron-pdf-${id}.bak`);
 try{
  await exclusiveWrite(temporary,bytes);
  if(cancelled())return false;
  await adapter.assertSupported(path);if(volume!==await adapter.volume?.(path)||!await same())throw Error('EXTERNAL_FILE_CHANGED');
  if(cancelled())return false;
  // Commit point: after this atomic operation cancellation cannot undo a
  // completed export. A final disk error remains an unconfirmed save.
  if(expected)await adapter.replace(path,temporary,backup);else await adapter.create(path,temporary);
  await adapter.flush(path);await adapter.assertSupported(path);
  if(volume!==await adapter.volume?.(path)||sha256(await readFile(path))!==sha256(bytes))throw Error('PDF_SAVE_UNCONFIRMED');
  return true;
 }finally{await rm(temporary,{force:true}).catch(()=>{});}
}
