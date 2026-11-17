import { beforeAll, afterAll, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { AccountSession } from '../../apps/desktop/src/main/account-session.js';
import type { AccountRemote, AccountState } from '../../apps/desktop/src/main/account-session.js';
import { AccountClient } from '../../packages/account-ui/src/client.js';
import { startAccountHost, PASSWORD, NEW_PASSWORD } from '../support/account-host.js';
import type { AccountHost } from '../support/account-host.js';
let host: AccountHost;
beforeAll(async () => { host = await startAccountHost(); }, 30000);
afterAll(async () => { await host?.close(); });
async function fixture() {
  let state: AccountState | undefined;
  const remote: AccountRemote = { online: () => true, async request(method,path,body,credential) {
    const response = await host.request(method,path,body,undefined,credential ? { Authorization: credential } : {});
    return { status: response.status, body: response.body,
      ...(response.headers.get('authorization') ? { credential: response.headers.get('authorization')! } : {}),
      ...(response.headers.get('x-deletion-credential') ? { deletionCredential: response.headers.get('x-deletion-credential')! } : {}),
    };
  } };
  const cad = new AccountSession({ async load() { return state; }, async save(next) { state = structuredClone(next); } },remote);
  await cad.initialize();
  const client = new AccountClient({ request: (action,body) => cad.action(action,body) }, { load: () => [], save() {} });
  return { cad, client, state: () => state };
}
it('pantalla CAD → cliente → main → API real: perfil, eliminación, credencial protegida y recuperación', async () => {
  const account = await host.verifiedAccount(), f = await fixture();
  await f.client.query('login', { email: account.email, password: PASSWORD }); f.client.accountId = account.accountId;
  await f.client.mutate('updateProfile', { displayName: 'Patronista' });
  expect(await f.client.query('profile')).toMatchObject({ displayName: 'Patronista' });
  const scope = await f.client.query('scope', { accountId: account.accountId }) as { scopeRevision: string };
  const result = await f.client.mutate('deleteAccount', { currentPassword: PASSWORD, phrase: 'ELIMINAR MI CUENTA', scopeRevision: scope.scopeRevision });
  expect(JSON.stringify(result)).not.toContain('Bearer'); expect(f.state()!.deletionChecks).toHaveLength(1);
  await f.client.query('forgetSession'); expect(f.state()!.active).toBeNull(); expect(f.cad.status().localEnabled).toBe(true);
  expect(await f.client.query('checks')).toMatchObject([{ state: 'pending' }]);
  await f.client.query('login', { email: account.email, password: PASSWORD });
  expect(await f.client.query('snapshot')).toMatchObject({ session: { accessClass: 'account_recovery' } });
  await f.client.mutate('recoverAccount', { confirmationText: 'Recuperar mi cuenta' });
  await f.client.query('forgetSession'); expect(await f.client.query('checks')).toMatchObject([{ state: 'cancelled' }]);
  expect(JSON.stringify(await f.client.query('checks'))).not.toContain('credential');
});
it('formularios de registro, verificación y reset usan respuestas reales, incluido 202 genérico', async () => {
  const f = await fixture(), email = randomUUID()+'@example.invalid';
  await f.client.mutate('register', { email, password: PASSWORD });
  await f.client.query('login', { email, password: PASSWORD });
  expect(await f.client.query('snapshot')).toMatchObject({ session: { accessClass: 'verification' }, localEnabled: false });
  await f.client.mutate('verificationRequest');
  await f.client.mutate('verificationConfirm', { token: await host.latestToken(email) });
  await f.client.query('forgetSession');
  await f.client.mutate('resetRequest', { email }); expect(f.client.pending).toHaveLength(0);
  await f.client.mutate('resetConfirm', { token: await host.latestToken(email), newPassword: NEW_PASSWORD });
  await f.client.query('login', { email, password: NEW_PASSWORD });
  expect(await f.client.query('snapshot')).toMatchObject({ session: { accessClass: 'normal' }, localEnabled: true });
});
