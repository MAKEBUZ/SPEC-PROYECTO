import {it,expect} from 'vitest';
import {AccountClient} from '../../packages/account-ui/src/client.js';
it('prepares a manual retry without sending it, then revalidates and creates a new operation linked to the failure',async()=>{
 const accountId=crypto.randomUUID(),oldId=crypto.randomUUID(),sent:Record<string,unknown>[]=[];let allowed=true;
 const client=new AccountClient({request:async(action,input)=>{
  if(action==='history'){if(!allowed)throw Error('RETRY_UNAVAILABLE');return {status:200,body:{accountId,operationId:oldId,type:'updateProfile'}};}
  const body=input as Record<string,unknown>;sent.push(body);return {status:200,body:{operationId:body.operationId,state:'resolved',outcome:'success',confirmedAt:'2026-11-16T00:00:00Z',data:{}}};
 }},{load:()=>[],save:()=>{}});client.accountId=accountId;
 await client.prepareRetry(oldId);expect(sent).toEqual([]);await client.mutate('updateProfile',{displayName:'Actual'});
 expect(sent[0]!.retryOf).toBe(oldId);expect(sent[0]!.operationId).not.toBe(oldId);
 await client.prepareRetry(oldId);allowed=false;await expect(client.mutate('updateProfile',{displayName:'No enviar'})).rejects.toThrow('RETRY_UNAVAILABLE');expect(sent).toHaveLength(1);
});
