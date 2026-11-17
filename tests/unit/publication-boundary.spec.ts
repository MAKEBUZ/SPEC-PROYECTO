import {it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {parseIpcRequest} from '../../packages/contracts/src/ipc.js';
import {publicationRoute} from '../../apps/desktop/src/main/publication/routes.js';
import {CadTools} from '../../apps/desktop/src/renderer/cad/tools.js';
it('allows only typed publication actions and requires explicit abandonment confirmation',()=>{
 const base={requestId:randomUUID(),method:'publication.action',documentHandle:randomUUID(),revisionId:'a'.repeat(64)};
 expect(parseIpcRequest({...base,action:'publish',body:{projectId:randomUUID(),patternName:'P'}}).action).toBe('publish');
 for(const bad of [{action:'publish',body:{projectId:randomUUID(),patternName:'P',credential:'secret'}},{action:'abandon',body:{confirmed:false}},{action:'upload',body:{path:'C:/secret'}},{action:'projects',body:{cursor:10}}])expect(()=>parseIpcRequest({...base,...bad})).toThrow();
 expect(publicationRoute('PUT',`/publications/${randomUUID()}/files/${randomUUID()}`)).toBe(true);
 for(const [method,path] of [['GET','https://example.invalid/'],['GET','/files/'+randomUUID()+'/content?path=secret'],['POST','/account/deletion'],['PUT','/publications/'+randomUUID()+'/files/../secret']])expect(publicationRoute(method!,path!)).toBe(false);
});
it('updates transport binding without changing editable revision, dirty state or undo geometry',()=>{
 const tools=new CadTools();tools.draw([[0,0],[10,0]]);const before=tools.document(),dirty=tools.dirty,binding={accountId:randomUUID(),patternId:randomUUID(),lastPublishedVersion:randomUUID()};
 tools.attachRemoteBinding(binding);expect(tools.document().revisionId).toBe(before.revisionId);expect(tools.document().pieces).toEqual(before.pieces);expect(tools.dirty).toBe(dirty);
 tools.undo();expect(tools.document().remoteBinding).toEqual(binding);tools.redo();expect(tools.document().remoteBinding).toEqual(binding);expect(tools.document().pieces).toEqual(before.pieces);
});
it('accepts PDF artifact identities but never renderer paths, duplicate selections or fabricated metadata',()=>{
 const base={requestId:randomUUID(),method:'publication.prepare',documentHandle:randomUUID(),revisionId:'a'.repeat(64)};
 expect(parseIpcRequest({...base,pdfIds:['b'.repeat(64)]}).pdfIds).toEqual(['b'.repeat(64)]);
 for(const pdfIds of [['C:/private/file.pdf'],['b'.repeat(64),'b'.repeat(64)],[{id:'b'.repeat(64),verified:true}],['B'.repeat(64)],'b'.repeat(64)])expect(()=>parseIpcRequest({...base,pdfIds})).toThrow();
 expect(()=>parseIpcRequest({...base,pdfIds:[],verified:true})).toThrow();
 expect(()=>parseIpcRequest({...base,method:'publication.action',action:'publish',body:{projectId:randomUUID(),patternName:'P',pdfIds:['../file.pdf']}})).toThrow();
});
