import { beforeAll, afterAll, expect, it } from 'vitest';
import { AccountSession } from '../../apps/desktop/src/main/account-session.js';
import type { AccountRemote, AccountState } from '../../apps/desktop/src/main/account-session.js';
import { startAccountHost, PASSWORD } from '../support/account-host.js';
import type { AccountHost } from '../support/account-host.js';
let host: AccountHost;
beforeAll(async () => { host = await startAccountHost(); }, 30000);
afterAll(async () => { await host?.close(); });
it('CAD habilitado tras login verificado; logout offline revoca solo la antigua al reconectar', async () => {
  const account = await host.verifiedAccount(); let online = true; let persisted: AccountState | undefined;
  const store = { async load() { return persisted && structuredClone(persisted); }, async save(value: AccountState) { persisted = structuredClone(value); } };
  const remote: AccountRemote = { online: () => online, async request(method, path, body, credential) {
    if (!online) throw new Error('offline');
    const reply = await host.request(method, path, body, undefined, credential ? { Authorization: credential } : {});
    return { status: reply.status, body: reply.body, ...(reply.headers.get('authorization') ? { credential: reply.headers.get('authorization')! } : {}) };
  } };
  const cad = new AccountSession(store, remote); await cad.initialize();
  await cad.login(account.email, PASSWORD); expect(cad.status().localEnabled).toBe(true);
  const old = persisted!.active!.view.id; online = false; await cad.logout();
  expect(cad.status()).toMatchObject({ localEnabled: true, remote: 'signed_out', revocationPending: true });
  const reopened = new AccountSession(store, remote); await reopened.initialize(); online = true;
  await reopened.login(account.email, PASSWORD); const current = persisted!.active!.view.id;
  await reopened.reconnect();
  expect((await host.pool.query('SELECT revoked_at FROM sessions WHERE id=$1', [old])).rows[0].revoked_at).not.toBeNull();
  expect((await host.pool.query('SELECT revoked_at FROM sessions WHERE id=$1', [current])).rows[0].revoked_at).toBeNull();
  await host.pool.query('UPDATE sessions SET revoked_at=clock_timestamp() WHERE id=$1', [current]);
  await reopened.refresh(); expect(reopened.status()).toMatchObject({ localEnabled: true, remote: 'signed_out' });
});
