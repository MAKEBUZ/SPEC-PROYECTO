import { expect, it } from 'vitest';
import { AccountClient } from '../../packages/account-ui/src/client.js';

it('persiste el pendiente antes de enviar y no repite una mutación incierta', async () => {
  const events: string[] = []; let saved: unknown;
  const client = new AccountClient({ async request() { events.push('send'); throw new Error('offline'); } }, {
    load: () => [], save: value => { events.push('save'); saved = value; },
  });
  await expect(client.mutate('resetRequest', { email: 'test@example.invalid' })).rejects.toThrow();
  expect(events).toEqual(['save','send']); expect(JSON.stringify(saved)).not.toContain('test@example');
  await expect(client.mutate('resetRequest', { email: 'test@example.invalid' })).rejects.toThrow();
  expect(events).toEqual(['save','send']);
});
it('fallo de persistencia impide enviar y un rechazo confirmado libera el pendiente', async () => {
  let calls = 0;
  const transport = { async request() { calls++; return { status: 400, body: { code: 'INVALID_INPUT', message: 'Revisa los campos.', traceId: crypto.randomUUID() } }; } };
  const fail = new AccountClient(transport, { load: () => [], save() { throw new Error('storage'); } });
  await expect(fail.mutate('resetRequest', { email: 'a' })).rejects.toThrow(); expect(calls).toBe(0);
  const client = new AccountClient(transport, { load: () => [], save() {} });
  await expect(client.mutate('resetRequest', { email: 'a' })).rejects.toThrow('Revisa'); expect(client.pending).toHaveLength(0);
});
it('T061 uses the host journal for authenticated uncertainty without retaining a second legacy copy',async()=>{
 const accountId=crypto.randomUUID(),operationId=crypto.randomUUID();let saved:unknown=[],checks=0;
 const client=new AccountClient({durableAdmission:true,request:async(action,body)=>{
  if(action==='history'){const b=body as {kind:string};if(b.kind==='view')return {status:200,body:{visible:true,accountId,pending:[{operationId}],settledLegacyIds:[]}};checks++;return {status:200,body:null};}
  throw Error('lost reply');
 }},{load:()=>saved,save:value=>{saved=value;}});client.accountId=accountId;
 await expect(client.mutate('updateProfile',{displayName:'Private name'})).rejects.toThrow('pendiente');expect(saved).toEqual([]);
 await client.checkPending();expect(checks).toBe(1);
});
