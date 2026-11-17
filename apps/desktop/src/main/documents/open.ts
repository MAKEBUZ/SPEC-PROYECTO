import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { parseDocument } from '../../../../../packages/document/src/schema.js';
import { revisionId } from '../../../../../packages/document/src/revision.js';
import { identity,LocalDocumentError } from './save.js';
import type { ReplacementAdapter } from './save.js';
/** Returns a candidate only. Caller replaces current memory after success. */
export async function openDocument(path:string,adapter:ReplacementAdapter){
  if(extname(path).toLowerCase()!=='.patron')throw new LocalDocumentError('DOCUMENT_INVALID');
  await adapter.assertSupported(path);
  const before=await identity(path);if(!before)throw new LocalDocumentError('STORAGE_UNAVAILABLE');
  const bytes=await readFile(path);let source:string;
  try{source=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{throw new LocalDocumentError('DOCUMENT_INVALID');}
  const snapshot=parseDocument(source);
  if(snapshot.revisionId!==revisionId(snapshot))throw new LocalDocumentError('DOCUMENT_INVALID');
  const after=await identity(path);if(JSON.stringify(before)!==JSON.stringify(after))throw new LocalDocumentError('EXTERNAL_FILE_CHANGED');
  return {snapshot,identity:after!};
}
