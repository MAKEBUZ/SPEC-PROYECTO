import type { LocalHandlers } from '../ipc-router.js';
import { CapabilityRegistry } from '../ipc-boundary.js';
import { RecoveryStore } from './recovery.js';
import { validateDocument } from '../../../../../packages/document/src/schema.js';
import type { SaveJournal } from './save-journal.js';

/** Main-owned capabilities, never renderer-supplied filenames. Recovery is a
 * candidate for unsaved editing; these handlers cannot save or publish it. */
export function recoveryHandlers(store:RecoveryStore,capabilities:CapabilityRegistry,owner:number,journal?:SaveJournal):LocalHandlers{
  const issued=new Map<string,string>();
  const resolve=(id:unknown)=>{
    const file=capabilities.resolve(String(id),owner,'recovery');
    if(typeof file!=='string')throw Error('RECOVERY_INVALID');return file;
  };
  const handlers:LocalHandlers={
    'recovery.capture':async request=>{
      await store.capture(validateDocument(request.snapshot));
      return {requestId:request.requestId,status:'success',data:{captured:true}};
    },
    'recovery.inspect':async request=>{
      const regular=await store.inspect(),saves=await journal?.inspect();
      const result={damaged:regular.damaged||saves?.damaged===true,candidates:[...regular.candidates.map(c=>({...c,source:'automatic',state:''})),...(saves?.candidates??[]).map(c=>({...c,id:`save:${c.id}`}))]};
      return {requestId:request.requestId,status:'success',data:{damaged:result.damaged,candidates:result.candidates.map(c=>{
        let recoveryId=issued.get(c.id);if(!recoveryId){recoveryId=capabilities.issue(owner,'recovery',c.id);issued.set(c.id,recoveryId);}
        return {recoveryId,documentId:c.documentId,savedAt:c.savedAt,source:c.source,state:c.state};
      })}};
    },
    'recovery.restore':async request=>{const id=resolve(request.recoveryId),source=id.startsWith('save:')?journal:store;if(!source)throw Error('RECOVERY_INVALID');return {requestId:request.requestId,status:'success',data:{snapshot:await source.restore(id.startsWith('save:')?id.slice(5):id,request.confirmed===true),saved:false}};},
    'recovery.discard':async request=>{
      const id=resolve(request.recoveryId),source=id.startsWith('save:')?journal:store;if(!source)throw Error('RECOVERY_INVALID');await source.discard(id.startsWith('save:')?id.slice(5):id,request.confirmed===true);
      return {requestId:request.requestId,status:'success',data:{discarded:true}};
    },
  };
  for(const method of Object.keys(handlers) as (keyof LocalHandlers)[]){
    const run=handlers[method]!;
    handlers[method]=async request=>{try{return await run(request);}catch{return {requestId:request.requestId,status:'error',error:{code:'RECOVERY_INVALID',message:'No se pudo completar la recuperación. Actualiza la lista y conserva el documento actual.'}};}};
  }
  return handlers;
}
