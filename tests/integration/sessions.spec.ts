import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll, expect, it } from 'vitest';
import { startAccountHost, PASSWORD, NEW_PASSWORD, terminal } from '../support/account-host.js';
import type { AccountHost } from '../support/account-host.js';
let host: AccountHost;
beforeAll(async () => { host = await startAccountHost(); }, 30000);
afterAll(async () => { await host?.close(); });
it('secreto de sesión aleatorio solo en creación; ID solo o secreto alterado no autentican', async () => {
  const account = await host.verifiedAccount(), session = account.session;
  expect(session.credential).toMatch(/^Bearer [\da-f-]{36}\.[\w-]{43}$/);
  const stored = (await host.pool.query('SELECT * FROM sessions WHERE id=$1', [session.view.id])).rows[0];
  expect(stored.token_hash).toMatch(/^[a-f0-9]{64}$/);
  expect(JSON.stringify(stored)).not.toContain(session.credential.split('.')[1]);
  for (const credential of [`Bearer ${session.view.id}`, session.credential.slice(0,-1)+'!']) {
    expect((await host.request('GET', '/account/profile', undefined, { ...session, credential })).status).toBe(401);
  }
  const profile = await host.request('GET', '/account/profile', undefined, session);
  expect(profile.status).toBe(200); expect(profile.headers.get('authorization')).toBeNull();
  expect(profile.body).toMatchObject({ id: account.accountId, email: account.email, limitBytes: 2000000000 });
});
it('perfil cambia solo nombre, conserva resultado al repetir y rechaza campos ajenos', async () => {
  const account = await host.verifiedAccount();
  const input = { operationId: randomUUID(), displayName: 'Nombre de ensayo' };
  const first = await host.request('PATCH', '/account/profile', input, account.session);
  expect(first.status).toBe(200); terminal(first);
  expect((await host.request('PATCH', '/account/profile', input, account.session)).body).toEqual(first.body);
  expect((await host.request('PATCH', '/account/profile', { ...input, displayName: 'Otro' }, account.session)).status).toBe(409);
  expect((await host.request('PATCH', '/account/profile', { ...input, operationId: randomUUID(), email: 'other@example.invalid' }, account.session)).status).toBe(400);
  expect((await host.request('GET', '/account/profile', undefined, account.session)).body.displayName).toBe(input.displayName);
});
it('cambio de contraseña exige reautenticación, cumple política y no aplica revocación de reset', async () => {
  const account = await host.verifiedAccount(); const other = await host.login(account.email);
  expect((await host.request('POST', '/account/password', { operationId: randomUUID(), currentPassword: 'wrong', newPassword: NEW_PASSWORD }, account.session)).body.code).toBe('REAUTHENTICATION_FAILED');
  expect((await host.request('POST', '/account/password', { operationId: randomUUID(), currentPassword: PASSWORD, newPassword: 'weak' }, account.session)).body.code).toBe('PASSWORD_POLICY');
  const input = { operationId: randomUUID(), currentPassword: PASSWORD, newPassword: NEW_PASSWORD };
  const first = await host.request('POST', '/account/password', input, account.session);
  expect(first.status).toBe(200);
  expect((await host.request('POST', '/account/password', input, account.session)).body).toEqual(first.body);
  for (const session of [account.session, other]) expect((await host.request('GET', '/account/profile', undefined, session)).status).toBe(200);
  expect((await host.request('POST', '/sessions', { email: account.email, password: PASSWORD, clientType: 'desktop' })).status).toBe(401);
  expect((await host.login(account.email, NEW_PASSWORD)).view.accessClass).toBe('normal');
});
it('logout tardío de sesión vencida solo invalida esa sesión', async () => {
  const account = await host.verifiedAccount(), current = await host.login(account.email);
  await host.pool.query(`WITH old AS (DELETE FROM sessions WHERE id=$1 RETURNING *), instant AS MATERIALIZED (SELECT clock_timestamp() AS now) INSERT INTO sessions
    SELECT id,account_id,token_hash,access_class,now-interval '8 days',now-interval '1 day',revoked_at FROM old,instant`, [account.session.view.id]);
  const input = { operationId: randomUUID() };
  const first = await host.request('DELETE', '/sessions/current', input, account.session);
  expect(first.status).toBe(200);
  expect((await host.request('DELETE', '/sessions/current', input, account.session)).body).toEqual(first.body);
  expect((await host.request('GET', '/account/profile', undefined, current)).status).toBe(200);
});
it('login durante eliminación emite acceso limitado y no amplía plazo; vencido no crea sesión', async () => {
  const account = await host.verifiedAccount();
  await host.pool.query("UPDATE accounts SET status='deletion_pending',deletion_deadline=clock_timestamp()+interval '1 day' WHERE id=$1", [account.accountId]);
  const before = await host.accountRow(account.accountId);
  const limited = await host.login(account.email);
  expect(limited.view.accessClass).toBe('account_recovery');
  expect((await host.request('GET', '/account/profile', undefined, limited)).status).toBe(403);
  expect((await host.accountRow(account.accountId)).deletion_deadline).toEqual(before.deletion_deadline);
  await host.pool.query("UPDATE accounts SET deletion_deadline=clock_timestamp()-interval '1 second' WHERE id=$1", [account.accountId]);
  const count = (await host.pool.query('SELECT count(*) FROM sessions WHERE account_id=$1', [account.accountId])).rows[0].count;
  expect((await host.request('POST', '/sessions', { email: account.email, password: PASSWORD, clientType: 'desktop' })).status).toBe(401);
  expect((await host.pool.query('SELECT count(*) FROM sessions WHERE account_id=$1', [account.accountId])).rows[0].count).toBe(count);
});
it('un mismo operationId de logout no puede referirse a otra sesión', async () => {
  const account = await host.verifiedAccount(), other = await host.login(account.email);
  const input = { operationId: randomUUID() };
  expect((await host.request('DELETE', '/sessions/current', input, account.session)).status).toBe(200);
  expect((await host.request('DELETE', '/sessions/current', input, other)).body.code).toBe('IDEMPOTENCY_CONFLICT');
  expect((await host.request('GET', '/account/profile', undefined, other)).status).toBe(200);
});
it('expiración durante revoke-all revierte todas las revocaciones', async () => {
  const account = await host.verifiedAccount(), other = await host.login(account.email);
  await host.pool.query(`CREATE FUNCTION delay_revocation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_sleep(0.3); RETURN NEW; END; $$`);
  await host.pool.query('CREATE TRIGGER delay_revocation BEFORE UPDATE ON sessions FOR EACH ROW EXECUTE FUNCTION delay_revocation()');
  await host.pool.query(`WITH old AS (DELETE FROM sessions WHERE id=$1 RETURNING *), instant AS MATERIALIZED (SELECT clock_timestamp() AS now)
    INSERT INTO sessions SELECT id,account_id,token_hash,access_class,now,now+interval '200 milliseconds',revoked_at FROM old,instant`, [account.session.view.id]);
  try { expect((await host.request('POST', '/sessions/revoke-all', { operationId: randomUUID(), confirmation: true }, account.session)).body.code).toBe('SESSION_EXPIRED'); }
  finally { await host.pool.query('DROP TRIGGER delay_revocation ON sessions'); await host.pool.query('DROP FUNCTION delay_revocation()'); }
  expect((await host.pool.query('SELECT revoked_at FROM sessions WHERE id=ANY($1::uuid[])', [[account.session.view.id, other.view.id]])).rows.every(row => row.revoked_at === null)).toBe(true);
});
it('fallo confirmado de reautenticación no se convierte en éxito reutilizando el intento', async () => {
  const account = await host.verifiedAccount();
  const input = { operationId: randomUUID(), currentPassword: 'wrong', newPassword: NEW_PASSWORD };
  expect((await host.request('POST', '/account/password', input, account.session)).body.code).toBe('REAUTHENTICATION_FAILED');
  expect((await host.request('POST', '/account/password', { ...input, currentPassword: PASSWORD }, account.session)).body.code).toBe('IDEMPOTENCY_CONFLICT');
  const serialized = JSON.stringify((await host.pool.query('SELECT * FROM operation_results WHERE requester_id=$1', [account.accountId])).rows);
  expect(serialized).not.toContain(PASSWORD); expect(serialized).not.toContain(NEW_PASSWORD); expect(serialized).not.toContain(account.session.credential);
});
