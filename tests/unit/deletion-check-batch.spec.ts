import {expect,it} from 'vitest';
import {deletionCheckBatch,parseDeletionCheckBatch} from '../../packages/contracts/src/deletion-check-batch.js';
const ids=['80000000-0000-4000-8000-000000000001','80000000-0000-4000-8000-000000000002','80000000-0000-4000-8000-000000000003'];
it('rejects mismatched and malformed proofs without blocking the remaining requests',async()=>{
 const called:string[]=[];
 const batch=await deletionCheckBatch(ids,async id=>{called.push(id);if(id===ids[0])return {requestId:ids[1],state:'pending'};if(id===ids[1])return {state:'deleted'};return {requestId:id,state:'pending'};});
 expect(called).toEqual(ids);expect(parseDeletionCheckBatch(batch)).toEqual({failed:true,rows:[{requestId:ids[2],state:'pending'}]});
});
it('all failed checks remain unknown and full success keeps the existing array contract',async()=>{
 expect(await deletionCheckBatch(ids,async()=>{throw Error('secret');})).toEqual({rows:[],failed:true});
 expect(await deletionCheckBatch([ids[0]!,ids[0]!],async id=>({requestId:id,state:'pending'}))).toEqual([{requestId:ids[0],state:'pending'}]);
 expect(()=>parseDeletionCheckBatch({rows:[],failed:true,credential:'secret'})).toThrow();
});
