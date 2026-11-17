import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { AccountSession } from '../../apps/desktop/src/main/account-session.js';
import type { AccountState, AccountStore, AccountRemote } from '../../apps/desktop/src/main/account-session.js';

class Store implements AccountStore {
  value: AccountState | undefined; fail = false;
  async load() { return this.value ? structuredClone(this.value) : undefined; }
  async save(value: AccountState) { if (this.fail) throw new Error('storage'); this.value = structuredClone(value); }
}
it('una credencial inválida no impide comprobar otra solicitud ni revela las credenciales',async()=>{
 const f=fixture(),session=new AccountSession(f.store,f.remote);await session.initialize();
 const invalid=randomUUID(),valid=randomUUID(),secret=`Bearer ${randomUUID()}.${'d'.repeat(43)}`;
 await session.rememberDeletionCredential({requestId:invalid,credential:secret});
 await session.rememberDeletionCredential({requestId:valid,credential:`Bearer ${randomUUID()}.${'e'.repeat(43)}`});
 const original=f.remote.request;
 f.remote.request=(method,path,body,credential)=>path==='/deletion-status/'+invalid?Promise.resolve({status:401,body:{code:'TOKEN_INVALID'}}):original(method,path,body,credential);
 const result=await session.action('checks',undefined);
 expect(result).toEqual({status:200,body:{rows:[{requestId:valid,state:'pending'}],failed:true}});
 expect(JSON.stringify(result)).not.toContain(secret);expect(f.store.value!.deletionChecks).toHaveLength(2);
});
it('enlaza logout diferido y cerrar todas al journal antes del transporte, sin entregar credenciales',async()=>{
 const f=fixture(),session=new AccountSession(f.store,f.remote),events:string[]=[];
 const request=f.remote.request;f.remote.request=async(method,path,body,credential)=>{if(path==='/sessions/current'||path==='/sessions/revoke-all')events.push('send');return request(method,path,body,credential);};
 session.trackOperations({beginMutation:async(account,type,body)=>{expect(account).toMatch(/^[a-f0-9-]{36}$/);expect(JSON.stringify(body)).not.toContain('Bearer');events.push('begin:'+type);},acceptOperation:async(_account,type)=>{events.push('resolved:'+type);}});
 await session.initialize();await session.login('a','b');f.setOnline(false);await session.logout();expect(events).toEqual([]);
 f.setOnline(true);await session.reconnect();expect(events).toEqual(['begin:logout','send','resolved:logout']);
 events.length=0;await session.login('a','b');await session.logoutAll(true);expect(events).toEqual(['begin:revokeAll','send','resolved:revokeAll']);
});
function fixture() {
  const store = new Store(), accountId = randomUUID(); let online = true, verified = true, rejected = false;
  const calls: { method: string; path: string; body: unknown; credential: string | undefined }[] = [];
  const remote: AccountRemote = { online: () => online, async request(method, path, body, credential) {
    if (!online) throw new Error('offline'); calls.push({ method, path, body, credential });
    if (path === '/sessions') {
      const id = randomUUID(); return { status: 200, credential: `Bearer ${id}.${'a'.repeat(43)}`, body: { id, accountId, accessClass: verified ? 'normal' : 'verification', startedAt: new Date().toISOString(), expiresAt: new Date(Date.now()+86400000).toISOString() } };
    }
    if (path === '/account/profile') return rejected ? { status: 401, body: { code: 'SESSION_REVOKED' } } : { status: 200, body: { id: accountId, email: 'test@example.invalid', verifiedAt: new Date().toISOString(), status: 'active', usedBytes: 0, reservedBytes: 0, limitBytes: 2000000000 } };
    if (path.startsWith('/deletion-status/')) return { status: 200, body: { requestId: path.split('/').at(-1), state: 'pending' } };
    return { status: 200, body: { operationId: (body as { operationId: string }).operationId, state: 'resolved', outcome: 'success', confirmedAt: new Date().toISOString(), data: {} } };
  } };
  return { store, remote, calls, setOnline(value: boolean) { online = value; }, setVerified(value: boolean) { verified = value; }, revoke() { rejected = true; } };
}
it('solo login normal verificado habilita CAD y el estado público nunca contiene credenciales', async () => {
  const f = fixture(), session = new AccountSession(f.store, f.remote); await session.initialize();
  expect(session.status().localEnabled).toBe(false); f.setVerified(false);
  await session.login('test@example.invalid', 'password'); expect(session.status().localEnabled).toBe(false);
  f.setVerified(true); await session.login('test@example.invalid', 'password');
  expect(session.status().localEnabled).toBe(true); expect(JSON.stringify(session.status())).not.toContain('Bearer');
  const reopened = new AccountSession(f.store, f.remote); f.setOnline(false); await reopened.initialize();
  expect(reopened.status().localEnabled).toBe(true);
});
it('logout offline persiste solo capacidad de revocación, sobrevive reapertura y no revoca nuevo login', async () => {
  const f = fixture(), session = new AccountSession(f.store, f.remote); await session.initialize(); await session.login('a', 'b');
  const old = f.store.value!.active!.credential;
  f.setOnline(false); await session.logout(); expect(session.status()).toMatchObject({ localEnabled: true, remote: 'signed_out', revocationPending: true });
  expect(f.store.value!.active).toBeNull(); expect(f.store.value!.revocations[0]!.credential).toBe(old);
  const reopened = new AccountSession(f.store, f.remote); await reopened.initialize();
  f.setOnline(true); await reopened.login('a', 'b'); const current = f.store.value!.active!.credential;
  await reopened.reconnect();
  const revocation = f.calls.find(call => call.path === '/sessions/current'); expect(revocation?.credential).toBe(old);
  expect(f.store.value!.active!.credential).toBe(current); expect(reopened.status().revocationPending).toBe(false);
});
it('invalidación o vencimiento bloquean remoto sin deshabilitar CAD ni tocar documentos', async () => {
  const f = fixture(), session = new AccountSession(f.store, f.remote); await session.initialize(); await session.login('a', 'b');
  f.revoke(); await session.refresh(); expect(session.status().localEnabled).toBe(true); expect(session.status().remote).toBe('signed_out');
});
it('cerrar todas exige conexión y confirmación, sin alterar sesión al rechazarse localmente', async () => {
  const f = fixture(), session = new AccountSession(f.store, f.remote); await session.initialize(); await session.login('a', 'b');
  await expect(session.logoutAll(false)).rejects.toThrow(); f.setOnline(false);
  await expect(session.logoutAll(true)).rejects.toThrow(); expect(f.store.value!.active).not.toBeNull();
  f.setOnline(true); await session.logoutAll(true); expect(f.store.value!.active).toBeNull(); expect(session.status().localEnabled).toBe(true);
});
it('SC-281: credencial de eliminación se conserva tras logout y se usa solo en su consulta', async () => {
  const f = fixture(), session = new AccountSession(f.store, f.remote); await session.initialize(); await session.login('a', 'b');
  const requestId = randomUUID(), credential = `Bearer ${randomUUID()}.${'d'.repeat(43)}`;
  await session.rememberDeletionCredential({ requestId, credential }); await session.logout();
  const reopened = new AccountSession(f.store, f.remote); await reopened.initialize();
  await reopened.checkDeletion(requestId);
  expect(f.calls.filter(call => call.credential === credential).map(call => call.path)).toEqual(['/deletion-status/'+requestId]);
  expect(JSON.stringify(reopened.status())).not.toContain(credential);
});
it('fallo de persistencia no afirma login habilitado ni logout completado', async () => {
  const f = fixture(), session = new AccountSession(f.store, f.remote); await session.initialize(); f.store.fail = true;
  await expect(session.login('a', 'b')).rejects.toThrow(); expect(session.status().localEnabled).toBe(false);
  f.store.fail = false; await session.login('a', 'b'); f.store.fail = true;
  await expect(session.logout()).rejects.toThrow(); expect(session.status().remote).toBe('active');
});
it('resultado desconocido de cerrar todas persiste y no se reenvía al reconectar', async () => {
  const f = fixture(), original = f.remote.request;
  let allAttempts = 0;
  f.remote.request = async (method, path, body, credential) => {
    if (path === '/sessions/revoke-all') { allAttempts++; throw new Error('lost response'); }
    return original(method, path, body, credential);
  };
  const session = new AccountSession(f.store, f.remote); await session.initialize(); await session.login('a', 'b');
  await session.logoutAll(true); expect(session.status()).toMatchObject({ localEnabled: true, remote: 'signed_out', logoutAllPending: true });
  const pending = f.store.value!.allPending;
  const reopened = new AccountSession(f.store, f.remote); await reopened.initialize(); await reopened.reconnect();
  expect(allAttempts).toBe(1); expect(f.store.value!.allPending).toEqual(pending);
});
it('sesión vencida no borra la habilitación guardada ni permite cerrar todas', async () => {
  const f = fixture(), session = new AccountSession(f.store, f.remote); await session.initialize(); await session.login('a', 'b');
  const view = f.store.value!.active!.view;
  view.startedAt = new Date(Date.now()-2*86400000).toISOString(); view.expiresAt = new Date(Date.now()-86400000).toISOString();
  const reopened = new AccountSession(f.store, f.remote); await reopened.initialize();
  expect(reopened.status()).toMatchObject({ localEnabled: true, remote: 'expired' });
  await expect(reopened.logoutAll(true)).rejects.toThrow();
});
it('rechazo confirmado de cerrar todas no se anuncia como éxito ni resultado desconocido', async () => {
  const f = fixture(), original = f.remote.request;
  f.remote.request = (method, path, body, credential) => path === '/sessions/revoke-all'
    ? Promise.resolve({ status: 401, body: { code: 'SESSION_REVOKED', message: 'Inicia sesión.', traceId: randomUUID() } }) : original(method, path, body, credential);
  const session = new AccountSession(f.store, f.remote); await session.initialize(); await session.login('a', 'b');
  expect(await session.logoutAll(true)).toMatchObject({ allResult: 'rejected', logoutAllPending: false, localEnabled: true });
});
