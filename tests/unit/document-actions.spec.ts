import { it,expect } from 'vitest';
import { CadTools } from '../../apps/desktop/src/renderer/cad/tools.js';
import { DocumentActions } from '../../apps/desktop/src/renderer/documents/document-actions.js';
it.each(['cancel-confirmation','cancel-save','fail-save'])('never generates a PDF after %s and retains edits',async fault=>{
 const tools=new CadTools();tools.draw([[0,0],[1,1]]);const before=tools.document(),calls:string[]=[];
 const actions=new DocumentActions(tools,async r=>{
  calls.push(String(r.method));
  if(r.method==='export.confirmSave')return {status:'success',data:{confirmed:fault!=='cancel-confirmation'}};
  if(r.method==='document.register')return {status:'success',data:{documentHandle:crypto.randomUUID()}};
  if(r.method==='document.save')return {status:fault==='cancel-save'?'cancelled':'error',data:null};
  throw Error('Generation must not start');
 },()=>{});
 await actions.exportPdf(crypto.randomUUID(),()=>{},()=>{});
 expect(calls).not.toContain('export.generate');expect(tools.document()).toEqual(before);expect(tools.dirty).toBe(true);expect(tools.locked).toBe(false);
});
it('locks editing and undo until a PDF job finishes, then restores editing',async()=>{
 const tools=new CadTools();let finish!:(v:{status:string;data:unknown})=>void;
 const actions=new DocumentActions(tools,async r=>{
  if(r.method==='document.register')return {status:'success',data:{documentHandle:crypto.randomUUID()}};
  if(r.method==='document.save')return {status:'success',data:{snapshot:{...r.snapshot as object,revisionId:'a'.repeat(64)}}};
  if(r.method==='export.generate')return {status:'success',data:{jobId:crypto.randomUUID()}};
  if(r.method==='export.status')return new Promise(resolve=>{finish=resolve;});
  throw Error('unexpected');
 },()=>{});
 await actions.save();const exportPromise=actions.exportPdf(crypto.randomUUID(),()=>{},()=>{});
 await new Promise(resolve=>setTimeout(resolve,0));expect(tools.locked).toBe(true);expect(()=>tools.undo()).toThrow('exportación');expect(()=>tools.create(true)).toThrow('exportación');expect(await actions.save()).toBe(false);
 finish({status:'success',data:{state:'completed'}});await exportPromise;expect(tools.locked).toBe(false);
});
it('keeps editing locked after a failed status read and retries only the status',async()=>{
 const tools=new CadTools(),states:string[]=[];let statusReads=0,generations=0;
 const actions=new DocumentActions(tools,async r=>{
  if(r.method==='document.register')return {status:'success',data:{documentHandle:crypto.randomUUID()}};
  if(r.method==='document.save')return {status:'success',data:{snapshot:{...r.snapshot as object,revisionId:'a'.repeat(64)}}};
  if(r.method==='export.generate'){generations++;return {status:'success',data:{jobId:crypto.randomUUID()}};}
  if(r.method==='export.status'){expect(tools.locked).toBe(true);if(statusReads++===0)throw Error('transient IPC failure');return {status:'success',data:{state:'completed'}};}
  throw Error('unexpected');
 },()=>{});
 await actions.save();await actions.exportPdf(crypto.randomUUID(),p=>states.push(p.state),()=>{});
 expect(generations).toBe(1);expect(states).toContain('checking');expect(tools.locked).toBe(false);
});
it('serializes background publication status with conflict inspection',async()=>{
 const tools=new CadTools(),calls:string[]=[];let release!:()=>void;
 const actions=new DocumentActions(tools,async r=>{
  if(r.method==='document.register')return {status:'success',data:{documentHandle:crypto.randomUUID()}};
  if(r.method==='document.save')return {status:'success',data:{snapshot:{...r.snapshot as object,revisionId:'a'.repeat(64)}}};
  calls.push(String(r.method));if(r.method==='publication.action')await new Promise<void>(resolve=>{release=resolve;});
  return {status:'success',data:{kind:'current'}};
 },()=>{});await actions.save();const status=actions.publication('status');await Promise.resolve();const conflict=actions.inspectConflict();await Promise.resolve();
 expect(calls).toEqual(['publication.action']);release();await status;await conflict;expect(calls).toEqual(['publication.action','publication.conflict']);
});
it('applies conflict candidates as unsaved working copies and never overwrites newer edits',async()=>{
 for(const late of [false,true]){
  const tools=new CadTools();tools.draw([[0,0],[10,0]]);const originalId=tools.document().documentId;let resolveCalls=0;
  const candidate={...tools.document(),documentId:crypto.randomUUID()};
  const actions=new DocumentActions(tools,async r=>{
   if(r.method==='document.register')return {status:'success',data:{documentHandle:crypto.randomUUID()}};
   if(r.method==='document.save')return {status:'success',data:{snapshot:{...r.snapshot as object,revisionId:'a'.repeat(64)}}};
   if(r.method==='publication.resolveConflict'){resolveCalls++;if(late)tools.draw([[20,20],[30,30]]);return {status:'success',data:{snapshot:candidate,backupPath:'C:/private/backup.patron',kind:'remote'}};}
   throw Error('unexpected');
  },()=>{});await actions.save();
  await expect(actions.resolveConflict(crypto.randomUUID(),'load-remote',false)).rejects.toThrow('Confirma');expect(resolveCalls).toBe(0);
  if(late){await expect(actions.resolveConflict(crypto.randomUUID(),'load-remote',true)).rejects.toThrow('Respaldo:');expect(tools.document().documentId).toBe(originalId);expect(tools.document().pieces).toHaveLength(2);}
  else{await actions.resolveConflict(crypto.randomUUID(),'load-remote',true);expect(tools.document().documentId).toBe(candidate.documentId);expect(tools.dirty).toBe(true);await expect(actions.preparePublication()).rejects.toThrow('Guarda');}
 }
});
it('requires saving and rejects a publication preparation overtaken by edits',async()=>{
 const tools=new CadTools();let preparations=0,late=false;
 const actions=new DocumentActions(tools,async r=>{
  if(r.method==='document.register')return {status:'success',data:{documentHandle:crypto.randomUUID()}};
  if(r.method==='document.save')return {status:'success',data:{snapshot:{...r.snapshot as object,revisionId:'a'.repeat(64)}}};
  if(r.method==='publication.prepare'){preparations++;if(late)tools.draw([[0,0],[1,1]]);return {status:'success',data:{manifest:{}}};}
  throw Error('unexpected');
 },()=>{});
 await expect(actions.preparePublication()).rejects.toThrow('Guarda');expect(preparations).toBe(0);
 await actions.save();expect(await actions.preparePublication()).toEqual({manifest:{}});
 late=true;await expect(actions.preparePublication()).rejects.toThrow('cambió');expect(tools.dirty).toBe(true);
 await expect(actions.preparePublication()).rejects.toThrow('Guarda');expect(preparations).toBe(2);
});
it('does not trash on cancelled/failed save and preserves late edits after trash',async()=>{
 for(const outcome of ['cancelled','error','late-edit','success']){
  const tools=new CadTools();tools.draw([[0,0],[1,1]]);let deletes=0,fail=false;
  const actions=new DocumentActions(tools,async r=>{
   if(r.method==='document.register')return {status:'success',data:{documentHandle:crypto.randomUUID()}};
   if(r.method==='document.save')return fail&&outcome!=='late-edit'&&outcome!=='success'?{status:outcome,data:null}:{status:'success',data:{snapshot:{...r.snapshot as object,revisionId:'a'.repeat(64)}}};
   if(r.method==='document.confirmTrash')return {status:'success',data:{choice:'save',confirmationId:crypto.randomUUID()}};
   if(r.method==='document.trash'){deletes++;if(outcome==='late-edit')tools.draw([[2,2],[3,3]]);return {status:'success',data:{trashed:true}};}
   throw Error('Unexpected request');
  },()=>{});
  await actions.save();tools.draw([[1,1],[2,2]]);fail=true;await actions.trash();
  expect(deletes).toBe(outcome==='cancelled'||outcome==='error'?0:1);
  if(outcome==='success')expect(tools.document().pieces).toHaveLength(0);else expect(tools.dirty).toBe(true);
  if(outcome==='late-edit')expect(tools.document().pieces).toHaveLength(3);
 }
});
it('saves before creating a new document and never leaves on a cancelled or failed save',async()=>{
  for(const status of ['cancelled','error','success']){
    const tools=new CadTools();tools.draw([[0,0],[10,0]]);const old=tools.document();
    const actions=new DocumentActions(tools,async r=>{
      if(r.method==='document.confirmLeave')return {status:'success',data:{choice:'save'}};
      if(r.method==='document.register')return {status:'success',data:{documentHandle:crypto.randomUUID()}};
      return {status,data:{snapshot:{...r.snapshot as object,revisionId:'a'.repeat(64)}},error:{message:'storage failure'}};
    },()=>{});
    await actions.create();
    if(status==='success'){expect(tools.document().documentId).not.toBe(old.documentId);expect(tools.dirty).toBe(false);}
    else{expect(tools.document()).toEqual(old);expect(tools.dirty).toBe(true);}
  }
});
it('preserves edits made during saving and cancels the pending close',async()=>{
  const tools=new CadTools();tools.draw([[0,0],[10,0]]);let closeApproved=false,cancelled=false;
  const actions=new DocumentActions(tools,async r=>{
    if(r.method==='document.confirmLeave')return {status:'success',data:{choice:'save'}};
    if(r.method==='document.register')return {status:'success',data:{documentHandle:crypto.randomUUID()}};
    if(r.method==='document.save'){tools.draw([[0,0],[20,0]]);return {status:'success',data:{snapshot:{...r.snapshot as object,revisionId:'a'.repeat(64)}}};}
    if(r.method==='window.closeApproved')closeApproved=true;
    if(r.method==='window.closeCancelled')cancelled=true;
    return {status:'success',data:{}};
  },()=>{});
  await actions.close(crypto.randomUUID());expect(closeApproved).toBe(false);expect(cancelled).toBe(true);expect(tools.dirty).toBe(true);expect(tools.document().pieces).toHaveLength(2);
});
it('invalidates close approval if another edit arrives before unloading',async()=>{
  const tools=new CadTools();tools.draw([[0,0],[1,1]]);
  const actions=new DocumentActions(tools,async r=>r.method==='document.confirmLeave'?{status:'success',data:{choice:'discard'}}:{status:'success',data:{}},()=>{});
  await actions.close(crypto.randomUUID());expect(actions.mayUnload()).toBe(true);
  tools.draw([[2,2],[3,3]]);expect(actions.mayUnload()).toBe(false);
});
it('keeps the current document when opening is cancelled or invalid',async()=>{
  for(const status of ['cancelled','error']){
    const tools=new CadTools();tools.draw([[0,0],[1,1]]);const before=tools.document();
    const actions=new DocumentActions(tools,async r=>r.method==='document.confirmLeave'?{status:'success',data:{choice:'discard'}}:{status,data:null,error:{message:'Invalid file'}},()=>{});
    await actions.open();expect(tools.document()).toEqual(before);expect(tools.dirty).toBe(true);
  }
});
