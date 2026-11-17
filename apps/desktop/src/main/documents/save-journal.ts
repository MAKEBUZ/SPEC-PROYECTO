import { mkdir,readdir,readFile,lstat } from 'node:fs/promises';
import { join,dirname,resolve,isAbsolute,basename,extname } from 'node:path';
import { uuid } from '../../../../../packages/contracts/src/validation.js';
import { parseDocument } from '../../../../../packages/document/src/schema.js';
import { revisionId } from '../../../../../packages/document/src/revision.js';
import type { PatternDocument } from '../../../../../packages/document/src/schema.js';
import { exclusiveWrite,sha256,LocalDocumentError,type ReplacementAdapter } from './save.js';

export interface SaveIntent {version:2;saveId:string;path:string;volume:string|null;previousHash:string|null;newHash:string;revisionId:string;documentId:string;savedAt:string}
export interface SaveCandidate {id:string;documentId:string;savedAt:string;snapshot:PatternDocument;hash:string;state:'destination-verified'|'unconfirmed'|'unavailable';source:'interrupted-save'|'previous-save'}
export async function writeEvidence(path:string,value:unknown){const payload=JSON.stringify(value);await exclusiveWrite(path,Buffer.from(JSON.stringify({payload,checksum:sha256(Buffer.from(payload))})));}
async function regular(path:string){const s=await lstat(path);if(!s.isFile()||s.isSymbolicLink())throw new LocalDocumentError('RECOVERY_INVALID');return readFile(path);}
async function evidence(path:string):Promise<Record<string,unknown>>{const envelope=JSON.parse((await regular(path)).toString('utf8'));if(typeof envelope.payload!=='string'||sha256(Buffer.from(envelope.payload))!==envelope.checksum)throw Error('RECOVERY_INVALID');return JSON.parse(envelope.payload);}
const hash=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
async function exists(path:string){try{await lstat(path);return true;}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return false;throw e;}}

/** Reconcile evidence on every inspection, including the first one after restart.
 * Never retry a write, repair a target, or bind a restored snapshot to its old path.
 * All recovery content is on the local journal volume, independent of the USB.
 */
export class SaveJournal {
 constructor(private readonly directory:string,private readonly adapter:ReplacementAdapter){}
 async inspect():Promise<{candidates:SaveCandidate[];damaged:boolean}>{
  await mkdir(this.directory,{recursive:true,mode:0o700});const candidates:SaveCandidate[]=[];let damaged=false;
  for(const name of await readdir(this.directory)){
   if(!name.endsWith('.intent.json'))continue;
   try{
    const saveId=name.slice(0,-'.intent.json'.length);uuid(saveId);
    const raw=await evidence(join(this.directory,name));
    if(raw.version!==2||raw.saveId!==saveId||typeof raw.path!=='string'||!isAbsolute(raw.path)||resolve(raw.path)!==raw.path||extname(raw.path).toLowerCase()!=='.patron'||!hash(raw.newHash)||!hash(raw.revisionId)||!(raw.previousHash===null||hash(raw.previousHash))||!(raw.volume===null||typeof raw.volume==='string')||typeof raw.savedAt!=='string'||!Number.isFinite(Date.parse(raw.savedAt)))throw Error('RECOVERY_INVALID');
    uuid(raw.documentId);const intent=raw as unknown as SaveIntent;
    const confirmed=join(this.directory,`${saveId}.confirmed.json`);
    if(await exists(confirmed)){const c=await evidence(confirmed);if(c.saveId!==saveId||c.newHash!==intent.newHash||c.revisionId!==intent.revisionId)throw Error('RECOVERY_INVALID');continue;}
    let state:SaveCandidate['state']='unconfirmed',remoteAllowed=false;
    try{
     await this.adapter.assertSupported(intent.path);
     if(intent.volume!==null&&await this.adapter.volume?.(intent.path)!==intent.volume)throw Error('VOLUME_CHANGED');
     remoteAllowed=true;
     const target=await regular(intent.path);
     if(sha256(target)===intent.newHash)state='destination-verified';
    }catch{state='unavailable';}
    for(const kind of ['next','previous'] as const){
     const expected=kind==='next'?intent.newHash:intent.previousHash;if(!expected)continue;
     const id=`${saveId}.${kind}`,file=join(this.directory,`${id}.patron`);
     const discarded=join(this.directory,`${id}.discarded.json`);
     if(await exists(discarded)){const d=await evidence(discarded);if(d.id!==id||d.hash!==expected)throw Error('RECOVERY_INVALID');continue;}
     try{
      let bytes:Buffer|undefined;
      const locations=[file,...remoteAllowed?[intent.path,join(dirname(intent.path),`.patron-${saveId}.${kind==='next'?'tmp':'bak'}`)]:[]];
      for(const location of locations){try{
        if(location!==file){await this.adapter.assertSupported(location);if(intent.volume!==null&&await this.adapter.volume?.(location)!==intent.volume)continue;}
        const candidate=await regular(location);if(sha256(candidate)===expected){bytes=candidate;break;}
      }catch{/* Try another independently verified candidate, never repair. */}}
      if(!bytes)throw Error('RECOVERY_INVALID');
      const snapshot=parseDocument(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
      if(snapshot.revisionId!==revisionId(snapshot)||kind==='next'&&(snapshot.documentId!==intent.documentId||snapshot.revisionId!==intent.revisionId))throw Error('RECOVERY_INVALID');
      candidates.push({id,documentId:snapshot.documentId,savedAt:intent.savedAt,snapshot,hash:expected,state,source:kind==='next'?'interrupted-save':'previous-save'});
     }catch{damaged=true;}
    }
   }catch{damaged=true;}
  }
  return {candidates,damaged};
 }
 async restore(id:string,confirmed:boolean){if(!confirmed)throw new LocalDocumentError('RECOVERY_INVALID');const c=(await this.inspect()).candidates.find(c=>c.id===id);if(!c)throw new LocalDocumentError('RECOVERY_INVALID');return c.snapshot;}
 async discard(id:string,confirmed:boolean){
  if(!confirmed)throw new LocalDocumentError('RECOVERY_INVALID');const c=(await this.inspect()).candidates.find(c=>c.id===id);if(!c||basename(id)!==id)throw new LocalDocumentError('RECOVERY_INVALID');
  await writeEvidence(join(this.directory,`${id}.discarded.json`),{id,hash:c.hash});
 }
}
