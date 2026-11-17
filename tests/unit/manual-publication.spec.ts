import {it,expect} from 'vitest';
import {randomUUID,createHash} from 'node:crypto';
import {ManualPublication,type PublicationPorts} from '../../apps/desktop/src/main/publication/manual-publication.js';
import {canonicalize,revisionId} from '../../packages/document/src/revision.js';
import type {PublicationBundle} from '../../apps/desktop/src/main/publication/bundle.js';
function fixture(){
 const accountId=randomUUID(),sessionId=randomUUID(),projectId=randomUUID(),patternId=randomUUID(),versionId=randomUUID(),publicationId=randomUUID();
 const document={formatVersion:1 as const,documentId:randomUUID(),revisionId:'0'.repeat(64),units:'mm' as const,pieces:[],preparations:[]};document.revisionId=revisionId(document);
 const files=[{fileId:randomUUID(),bytes:Buffer.from(JSON.stringify(document))},{fileId:randomUUID(),bytes:new Uint8Array([137,80,78,71,13,10,26,10])}];
 const entries=files.map((f,i)=>({fileId:f.fileId,bytes:f.bytes.length,sha256:createHash('sha256').update(f.bytes).digest('hex'),originalName:i?'preview.png':'d.patron',mediaType:i?'image/png':'application/json',...i?{role:'preview' as const,exportProfileId:'patronaje-preview-1'}:{role:'editable' as const}}));
 const content={documentId:document.documentId,localRevisionId:document.revisionId,files:entries};
 const bundle:PublicationBundle={document,files,manifest:{...content,manifestHash:createHash('sha256').update(canonicalize(content)).digest('hex')}};
 const events:string[]=[],records:{type:string;body:Record<string,unknown>}[]=[],bindings:unknown[]=[];
 let blocked=false,session=sessionId;
 const ports:PublicationPorts={
  actor:async()=>({accountId,sessionId:session}),blocked:async()=>blocked,
  record:async(_a,type,body)=>{events.push('record:'+type);records.push({type,body});},
  begin:async()=>{events.push('begin');return {publicationId,manifestHash:bundle.manifest.manifestHash};},
  result:async(operationId,operationType)=>({operationId,operationType,state:'resolved',outcome:'success',confirmedAt:new Date().toISOString(),authorizedResourceRefs:[],actorLabel:'Autor'}),
  resolve:async()=>{events.push('resolve');},
  upload:async()=>{events.push('upload');},
  commit:async(_id,body)=>{events.push('commit');return {operationId:body.operationId,state:'resolved',outcome:'success',confirmedAt:new Date().toISOString(),data:{patternId,versionId,localRevisionId:document.revisionId}};},
  bind:async(_d,_r,b)=>{events.push('bind');bindings.push(b);},
 };
 return {bundle,ports,events,records,bindings,accountId,patternId,versionId,projectId,block:()=>{blocked=true;},logout:()=>{session=randomUUID();}};
}
it('records identities before transport and binds only after the complete commit',async()=>{
 const f=fixture(),original=structuredClone(f.bundle.document),out=await new ManualPublication(f.ports).publish(f.bundle,{projectId:f.projectId,patternName:' Patrón '});
 expect(out.state).toBe('published');expect(f.events).toEqual(['record:beginPublication','begin','resolve','upload','upload','record:commitPublication','commit','resolve','bind']);
 expect(f.records[0]!.body.patternName).toBe('Patrón');expect(f.records[0]!.body.operationId).not.toBe(f.records[1]!.body.operationId);
 expect(f.bindings).toEqual([{accountId:f.accountId,patternId:f.patternId,lastPublishedVersion:f.versionId}]);expect(f.bundle.document).toEqual(original);
});
it('never sends when pending scopes or local persistence prevent it',async()=>{
 for(const mode of ['pending','storage']){const f=fixture();if(mode==='pending')f.block();else f.ports.record=async()=>{throw Error('disk');};
 await expect(new ManualPublication(f.ports).publish(f.bundle,{projectId:f.projectId,patternName:'P'})).rejects.toThrow();expect(f.events).toEqual([]);}
});
it('does not commit a partial set or omit a failed upload',async()=>{
 const f=fixture();let uploads=0;f.ports.upload=async()=>{if(++uploads===2)throw Error('network');};
 await expect(new ManualPublication(f.ports).publish(f.bundle,{projectId:f.projectId,patternName:'P'})).rejects.toThrow('network');expect(f.records).toHaveLength(1);expect(f.bindings).toEqual([]);
});
it('keeps a lost commit response uncertain without replay or binding',async()=>{
 const f=fixture();let commits=0;f.ports.commit=async()=>{commits++;throw Error('response lost');};
 await expect(new ManualPublication(f.ports).publish(f.bundle,{projectId:f.projectId,patternName:'P'})).rejects.toThrow('response lost');expect(commits).toBe(1);expect(f.records).toHaveLength(2);expect(f.bindings).toEqual([]);
});
it('does not bind pending or failed commits',async()=>{
 for(const state of ['pending','failure']){const f=fixture();f.ports.commit=async(_id,b)=>state==='pending'?{operationId:b.operationId,state:'pending'}:{operationId:b.operationId,state:'resolved',outcome:'failure',confirmedAt:new Date().toISOString(),data:{code:'VERSION_CONFLICT'}};
 expect((await new ManualPublication(f.ports).publish(f.bundle,{projectId:f.projectId,patternName:'P'})).state).toBe(state==='pending'?'pending':'failed');expect(f.bindings).toEqual([]);}
});
it('stops subsequent transfers after the session changes',async()=>{
 const f=fixture();let uploads=0;f.ports.upload=async()=>{uploads++;f.logout();};
 await expect(new ManualPublication(f.ports).publish(f.bundle,{projectId:f.projectId,patternName:'P'})).rejects.toThrow('SESSION_CHANGED');expect(uploads).toBe(1);expect(f.records).toHaveLength(1);
});
it('rejects mismatched confirmation identity without binding',async()=>{
 const f=fixture();f.ports.commit=async()=>({operationId:randomUUID(),state:'pending'});
 await expect(new ManualPublication(f.ports).publish(f.bundle,{projectId:f.projectId,patternName:'P'})).rejects.toThrow('RESULT_MISMATCH');expect(f.bindings).toEqual([]);
});
it('does not transmit a bundle mutated after preparation',async()=>{
 const f=fixture();f.bundle.files[0]!.bytes[0]=0;
 await expect(new ManualPublication(f.ports).publish(f.bundle,{projectId:f.projectId,patternName:'P'})).rejects.toThrow('ARTIFACT_MISMATCH');expect(f.records).toEqual([]);
});
it('rejects binding metadata injected separately from the saved editable',async()=>{
 const f=fixture();f.bundle.document.remoteBinding={accountId:f.accountId,patternId:f.patternId,lastPublishedVersion:randomUUID()};
 await expect(new ManualPublication(f.ports).publish(f.bundle,{projectId:f.projectId,patternName:'P'})).rejects.toThrow('ARTIFACT_MISMATCH');expect(f.records).toEqual([]);
});
it('records a begin attempt before a lost response and performs no uploads or commit',async()=>{
 const f=fixture();f.ports.begin=async()=>{throw Error('lost');};
 await expect(new ManualPublication(f.ports).publish(f.bundle,{projectId:f.projectId,patternName:'P'})).rejects.toThrow('lost');expect(f.records.map(r=>r.type)).toEqual(['beginPublication']);expect(f.events).toEqual(['record:beginPublication']);
});
it('permits only one in-flight manual attempt',async()=>{
 const f=fixture();let release!:()=>void;f.ports.begin=async()=>{await new Promise<void>(r=>{release=r;});throw Error('stop');};const service=new ManualPublication(f.ports),first=service.publish(f.bundle,{projectId:f.projectId,patternName:'P'});const failed=expect(first).rejects.toThrow('stop');
 await expect(service.publish(f.bundle,{projectId:f.projectId,patternName:'P'})).rejects.toThrow('OPERATION_PENDING');while(!release)await new Promise(r=>setTimeout(r,0));release();await failed;
});
