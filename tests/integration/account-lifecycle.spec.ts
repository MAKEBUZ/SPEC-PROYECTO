import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { startAccountHost, terminal, rejected, PASSWORD, NEW_PASSWORD, DAY } from '../support/account-host.js';
import type { AccountHost } from '../support/account-host.js';

let host: AccountHost;
beforeAll(async () => { host = await startAccountHost(); });
afterAll(async () => { await host?.close(); });

it('FR-142: exige contraseña actual y frase exacta; rechazo conserva cuenta y sesiones', async () => {
  const account = await host.verifiedAccount(); const scopeRevision = await host.scope(account.session);
  for (const override of [{ currentPassword: 'Otra-Contraseña-99!' }, { phrase: 'eliminar mi cuenta' }]) {
    const response = await host.request('POST', '/account/deletion', { operationId: randomUUID(), currentPassword: PASSWORD, phrase: 'ELIMINAR MI CUENTA', scopeRevision, ...override }, account.session);
    rejected(response, ['REAUTHENTICATION_FAILED', 'INVALID_INPUT']);
    expect((await host.accountRow(account.accountId)).status).toBe('active');
    expect((await host.request('GET', '/account/profile', undefined, account.session)).status).toBe(200);
  }
});

it('FR-142: cambio del alcance confirmado impide eliminar un conjunto distinto', async () => {
  const account = await host.verifiedAccount(); const scopeRevision = await host.scope(account.session);
  await host.content.put({ id: randomUUID(), ownerId: account.accountId, state: 'active', expiresAt: null, payload: 'contenido nuevo' });
  rejected(await host.deleteAccount(account.session, PASSWORD, randomUUID(), scopeRevision), ['SCOPE_CHANGED']);
  expect((await host.accountRow(account.accountId)).status).toBe('active');
});

it('FR-143/144: fija 30 días, invalida sesiones y solo permite consultar plazo/recuperar', async () => {
  const account = await host.verifiedAccount(); const other = await host.login(account.email);
  const response = await host.deleteAccount(account.session);
  expect(response.status).toBe(200); const result = terminal(response);
  const deadline = new Date((await host.accountRow(account.accountId)).deletion_deadline as Date).getTime();
  expect(deadline - Date.parse(response.body.confirmedAt as string)).toBe(30 * DAY);
  for (const session of [account.session, other]) rejected(await host.request('GET', '/account/profile', undefined, session), ['SESSION_REVOKED', 'SESSION_REQUIRED', 'ACCOUNT_LIMITED']);
  const limited = await host.login(account.email);
  expect(limited.view.accessClass).toBe('account_recovery');
  expect((await host.request('GET', '/account/deletion', undefined, limited)).status).toBe(200);
  rejected(await host.request('GET', '/account/profile', undefined, limited), ['ACCOUNT_LIMITED']);
  expect(result).not.toHaveProperty('session');
});

it('FR-143: repetición concurrente de la solicitud no reinicia el vencimiento', async () => {
  const account = await host.verifiedAccount(); const scope = await host.scope(account.session); const operationId = randomUUID();
  const responses = await Promise.all([1, 2].map(() => host.deleteAccount(account.session, PASSWORD, operationId, scope)));
  const success = responses.find(response => response.status === 200);
  expect(success).toBeDefined();
  expect(responses.every(response => [200, 401, 403].includes(response.status))).toBe(true);
  const firstDeadline = (await host.accountRow(account.accountId)).deletion_deadline;
  const limited = await host.login(account.email);
  const first = await host.request('GET', '/account/deletion', undefined, limited);
  const second = await host.request('GET', '/account/deletion', undefined, limited);
  expect(first.status).toBe(200); expect(second.body.expiresAt).toBe(first.body.expiresAt);
  expect((await host.accountRow(account.accountId)).deletion_deadline).toEqual(firstDeadline);
});

it('FR-145/146: conserva contenido activo y papelera con sus plazos originales durante recuperación', async () => {
  const account = await host.verifiedAccount();
  await host.content.put({ id: randomUUID(), ownerId: account.accountId, state: 'active', expiresAt: null, payload: 'patrón editable y versiones' });
  await host.content.put({ id: randomUUID(), ownerId: account.accountId, state: 'trashed', expiresAt: new Date(Date.now() + DAY).toISOString(), payload: 'papelera previa' });
  await host.content.put({ id: randomUUID(), ownerId: randomUUID(), state: 'active', expiresAt: null, payload: 'contenido ajeno' });
  const before = host.content.snapshot();
  expect((await host.deleteAccount(account.session)).status).toBe(200);
  expect(host.content.snapshot()).toEqual(before);
  expect((await host.login(account.email)).view.accountId).toBe(account.accountId);
  const limited = await host.login(account.email);
  const recovered = await host.request('POST', '/account/recovery', { operationId: randomUUID(), confirmationText: 'Recuperar mi cuenta' }, limited);
  expect(recovered.status).toBe(200);
  expect(host.content.snapshot()).toEqual(before);
});

it('FR-147: autenticarse o consultar no cancela eliminación; frase incorrecta tampoco', async () => {
  const account = await host.verifiedAccount(); expect((await host.deleteAccount(account.session)).status).toBe(200);
  const before = await host.accountRow(account.accountId); const limited = await host.login(account.email);
  await host.request('GET', '/account/deletion', undefined, limited);
  rejected(await host.request('POST', '/account/recovery', { operationId: randomUUID(), confirmationText: 'recuperar' }, limited), ['INVALID_INPUT']);
  expect(await host.accountRow(account.accountId)).toMatchObject({ status: 'deletion_pending', deletion_deadline: before.deletion_deadline });
});

it('FR-147: recuperación iniciada antes del vencimiento se rechaza si el plazo venció al confirmar', async () => {
  const account = await host.verifiedAccount(); expect((await host.deleteAccount(account.session)).status).toBe(200);
  const limited = await host.login(account.email);
  await host.pool.query("UPDATE accounts SET deletion_deadline=clock_timestamp()-interval '1 second' WHERE id=$1", [account.accountId]);
  rejected(await host.request('POST', '/account/recovery', { operationId: randomUUID(), confirmationText: 'Recuperar mi cuenta' }, limited), ['RETENTION_EXPIRED', 'ACCOUNT_LIMITED']);
  expect((await host.accountRow(account.accountId)).status).toBe('deletion_pending');
});

it('FR-148/150: recuperación exige nuevo login y no convierte accesos limitados en normales', async () => {
  const account = await host.verifiedAccount(); expect((await host.deleteAccount(account.session)).status).toBe(200);
  const limited = await host.login(account.email); const secondLimited = await host.login(account.email);
  const response = await host.request('POST', '/account/recovery', { operationId: randomUUID(), confirmationText: 'Recuperar mi cuenta' }, limited);
  expect(response.status).toBe(200); expect(terminal(response)).toMatchObject({ loginRequired: true });
  expect(response.headers.get('authorization')).toBeNull();
  for (const session of [account.session, limited, secondLimited]) rejected(await host.request('GET', '/account/profile', undefined, session), ['SESSION_REVOKED', 'SESSION_REQUIRED', 'ACCOUNT_LIMITED']);
  const normal = await host.login(account.email); expect(normal.view.accountId).toBe(account.accountId); expect(normal.view.accessClass).toBe('normal');
});

it('FR-151: restablecer contraseña durante recuperación conserva eliminación y su fecha', async () => {
  const account = await host.verifiedAccount(); expect((await host.deleteAccount(account.session)).status).toBe(200);
  const before = await host.accountRow(account.accountId);
  expect((await host.request('POST', '/password-reset/request', { operationId: randomUUID(), email: account.email })).status).toBe(202);
  const token = await host.latestToken(account.email);
  const reset = await host.request('POST', '/password-reset/confirm', { operationId: randomUUID(), token, newPassword: NEW_PASSWORD });
  expect(reset.status).toBe(200); expect(terminal(reset)).toMatchObject({ loginRequired: true });
  expect(await host.accountRow(account.accountId)).toMatchObject({ status: 'deletion_pending', deletion_deadline: before.deletion_deadline });
  const limited = await host.login(account.email, NEW_PASSWORD); expect(limited.view.accessClass).toBe('account_recovery');
});

it('FR-151: enlace emitido antes del vencimiento de cuenta no permite restablecer después', async () => {
  const account = await host.verifiedAccount(); expect((await host.deleteAccount(account.session)).status).toBe(200);
  await host.request('POST', '/password-reset/request', { operationId: randomUUID(), email: account.email }); const token = await host.latestToken(account.email);
  const before = await host.accountRow(account.accountId);
  await host.pool.query("UPDATE accounts SET deletion_deadline=clock_timestamp()-interval '1 second' WHERE id=$1", [account.accountId]);
  rejected(await host.request('POST', '/password-reset/confirm', { operationId: randomUUID(), token, newPassword: NEW_PASSWORD }), ['RETENTION_EXPIRED', 'ACCOUNT_LIMITED']);
  expect((await host.accountRow(account.accountId)).password_hash).toBe(before.password_hash);
});

it('FR-145: solicita purga propia una sola vez al vencer; no la anticipa ni declara borrado físico por solicitarla', async () => {
  const account = await host.verifiedAccount();
  await host.content.put({ id: randomUUID(), ownerId: account.accountId, state: 'active', expiresAt: null, payload: 'propio' });
  await host.content.put({ id: randomUUID(), ownerId: randomUUID(), state: 'active', expiresAt: null, payload: 'ajeno' });
  const before = host.content.snapshot();
  expect((await host.deleteAccount(account.session)).status).toBe(200);
  await host.runDueAccountJobs();
  expect(host.content.purgeRequests.filter(request => request.ownerId === account.accountId)).toHaveLength(0);
  await host.pool.query("UPDATE accounts SET deletion_deadline=clock_timestamp()-interval '1 second' WHERE id=$1", [account.accountId]);
  await host.runDueAccountJobs(); await host.runDueAccountJobs();
  const requests = host.content.purgeRequests.filter(request => request.ownerId === account.accountId);
  expect(requests).toHaveLength(1);
  expect(requests[0]?.operationId).toEqual(expect.any(String));
  // The fixture records the request only. US8 must acknowledge real deletion;
  // it is intentionally impossible for this fake to pretend that purge finished.
  expect(host.content.snapshot()).toEqual(before);
});
