import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll, expect, it } from 'vitest';
import { startAccountHost, PASSWORD, DAY, terminal } from '../support/account-host.js';
import type { AccountHost } from '../support/account-host.js';
let host: AccountHost;
beforeAll(async () => { host = await startAccountHost(); }, 30000);
afterAll(async () => { await host?.close(); });
async function deleting() {
  const account = await host.verifiedAccount(), reply = await host.deleteAccount(account.session);
  expect(reply.status).toBe(200);
  const requestId = terminal(reply).requestId as string, credential = reply.headers.get('x-deletion-credential')!;
  expect(credential).toMatch(/^Bearer [a-f\d-]{36}\.[\w-]{43}$/);
  return { ...account, requestId, credential };
}
const status = (requestId: string, credential: string) => host.request('GET', '/deletion-status/'+requestId, undefined, undefined, { Authorization: credential });
it('capacidad solo consulta su solicitud sin sesión, no accede a perfil ni otra solicitud y no expone secretos', async () => {
  const first = await deleting(), second = await deleting();
  const reply = await status(first.requestId, first.credential);
  expect(reply.status).toBe(200); expect(reply.body).toEqual({ requestId: first.requestId, state: 'pending' });
  expect(reply.headers.get('cache-control')).toBe('no-store');
  expect((await status(second.requestId, first.credential)).status).toBe(403);
  expect((await status(first.requestId, first.session.credential)).status).toBe(401);
  expect((await host.request('GET', '/account/profile', undefined, undefined, { Authorization: first.credential })).status).toBe(401);
  const rows = await host.pool.query('SELECT * FROM deletion_check_credentials WHERE request_id=$1', [first.requestId]);
  expect(rows.rows[0].secret_hash).toMatch(/^[a-f0-9]{64}$/);
  expect(JSON.stringify(rows.rows)).not.toContain(first.credential.split('.')[1]);
  expect(JSON.stringify((await host.pool.query('SELECT * FROM operation_results WHERE requester_id=$1', [first.accountId])).rows)).not.toContain(first.credential.split('.')[1]);
});
it('otro dispositivo obtiene credencial propia dentro del plazo; replay no devuelve secreto ni reemite', async () => {
  const account = await deleting(), limited = await host.login(account.email);
  const input = { operationId: randomUUID() };
  const first = await host.request('POST', '/account/deletion/credentials', input, limited);
  expect(first.status).toBe(200); const secret = first.headers.get('x-deletion-credential')!; expect(secret).not.toBe(account.credential);
  const replay = await host.request('POST', '/account/deletion/credentials', input, limited);
  expect(replay.body).toEqual(first.body); expect(replay.headers.get('x-deletion-credential')).toBeNull();
  expect((await host.pool.query('SELECT * FROM deletion_check_credentials WHERE request_id=$1', [account.requestId])).rowCount).toBe(2);
  expect((await status(account.requestId, secret)).status).toBe(200);
  await host.pool.query("UPDATE accounts SET deletion_deadline=clock_timestamp()-interval '1 second' WHERE id=$1", [account.accountId]);
  expect((await host.request('POST', '/account/deletion/credentials', { operationId: randomUUID() }, limited)).body.code).toBe('RETENTION_EXPIRED');
});
it('recuperación confirma cancelled durante 90 días inmutables, sin restaurar las sesiones', async () => {
  const account = await deleting(), limited = await host.login(account.email);
  const reply = await host.request('POST', '/account/recovery', { operationId: randomUUID(), confirmationText: 'Recuperar mi cuenta' }, limited);
  expect(reply.status).toBe(200);
  const first = await status(account.requestId, account.credential);
  expect(first.body.state).toBe('cancelled');
  expect(Date.parse(first.body.checkExpiresAt as string)-Date.parse(first.body.confirmedAt as string)).toBe(90*DAY);
  expect((await status(account.requestId, account.credential)).body).toEqual(first.body);
  await expect(host.pool.query("UPDATE deletion_checks SET check_expires_at=check_expires_at+interval '1 day' WHERE request_id=$1", [account.requestId])).rejects.toThrow();
  expect((await host.request('GET', '/account/profile', undefined, limited)).status).toBe(401);
});
it('solo la purga completa confirma deleted; repetición no amplía los 90 días', async () => {
  const account = await deleting();
  await expect(host.confirmPurge(account.requestId)).rejects.toMatchObject({ code: 'DEPENDENCIES_BLOCK' });
  await host.pool.query("UPDATE accounts SET deletion_deadline=clock_timestamp()-interval '1 second' WHERE id=$1", [account.accountId]);
  await host.runDueAccountJobs();
  await expect(host.confirmPurge(account.requestId)).rejects.toMatchObject({ code: 'DEPENDENCIES_BLOCK' });
  expect((await status(account.requestId, account.credential)).body.state).toBe('pending');
  // Simulate US8's final database boundary only, using synthetic content with no
  // blobs. This is not evidence of a real S3/content purge implementation.
  await host.pool.query('DELETE FROM outbox_jobs WHERE account_id=$1', [account.accountId]);
  await host.pool.query('DELETE FROM one_use_tokens WHERE account_id=$1', [account.accountId]);
  await host.pool.query('DELETE FROM sessions WHERE account_id=$1', [account.accountId]);
  await host.pool.query('DELETE FROM accounts WHERE id=$1', [account.accountId]);
  await expect(host.confirmPurge(account.requestId)).rejects.toMatchObject({ code: 'DEPENDENCIES_BLOCK' });
  await host.pool.query('DELETE FROM operation_results WHERE requester_id=$1', [account.accountId]);
  const survivor=await host.verifiedAccount(),historicalOperation=randomUUID();
  await host.pool.query(`INSERT INTO operation_results(requester_id,operation_type,operation_id,historical_owner_id,request_hash,state,outcome,confirmed_at,data)
    VALUES($1,'purgePattern',$2,$3,'opaque','resolved','success',clock_timestamp(),$4::jsonb)`,
    [account.accountId,historicalOperation,survivor.accountId,JSON.stringify({patternId:randomUUID(),email:account.email,credential:'removed-secret'})]);
  await host.confirmPurge(account.requestId);
  const retained=(await host.pool.query('SELECT data FROM operation_results WHERE operation_id=$1',[historicalOperation])).rows[0];
  expect(Object.keys(retained.data)).toEqual(['patternId']);
  const historical=await host.request('GET',`/operations/${historicalOperation}?operationType=purgePattern`,undefined,survivor.session);
  expect(historical.body).toMatchObject({state:'resolved',outcome:'success',actorLabel:'Cuenta eliminada'});
  const first = await status(account.requestId, account.credential); expect(first.body.state).toBe('deleted');
  expect(Date.parse(first.body.checkExpiresAt as string)-Date.parse(first.body.confirmedAt as string)).toBe(90*DAY);
  await host.confirmPurge(account.requestId); expect((await status(account.requestId, account.credential)).body).toEqual(first.body);
  expect((await host.pool.query('SELECT account_id,operation_id,requested_at,expires_at FROM deletion_checks WHERE request_id=$1', [account.requestId])).rows[0]).toEqual({ account_id: null, operation_id: null, requested_at: null, expires_at: null });
});
it('al vencer retira credenciales y evidencia; el rechazo no se presenta como deleted', async () => {
  const account = await deleting(), limited = await host.login(account.email);
  await host.request('POST', '/account/recovery', { operationId: randomUUID(), confirmationText: 'Recuperar mi cuenta' }, limited);
  const credentials = (await host.pool.query('DELETE FROM deletion_check_credentials WHERE request_id=$1 RETURNING *', [account.requestId])).rows;
  await host.pool.query('DELETE FROM deletion_checks WHERE request_id=$1', [account.requestId]);
  // Replace only this synthetic fixture with an already-expired terminal row;
  // the production immutability trigger is never disabled.
  await host.pool.query("WITH instant AS MATERIALIZED (SELECT clock_timestamp()-interval '91 days' AS now) INSERT INTO deletion_checks(request_id,state,confirmed_at,check_expires_at) SELECT $1,'cancelled',now,now+interval '90 days' FROM instant", [account.requestId]);
  for (const row of credentials) await host.pool.query('INSERT INTO deletion_check_credentials(id,request_id,secret_hash,issued_at) VALUES ($1,$2,$3,$4)', [row.id, row.request_id, row.secret_hash, row.issued_at]);
  expect((await status(account.requestId, account.credential)).status).toBeGreaterThanOrEqual(400);
  await host.runDueAccountJobs();
  expect((await host.pool.query('SELECT * FROM deletion_checks WHERE request_id=$1', [account.requestId])).rowCount).toBe(0);
  expect((await host.pool.query('SELECT * FROM deletion_check_credentials WHERE request_id=$1', [account.requestId])).rowCount).toBe(0);
});
it('cookie U2 usa ruta restringida y no se elimina al cerrar sesión web', async () => {
  const account = await host.verifiedAccount(); const origin = 'https://patron.example.invalid';
  const bootstrap = await host.request('GET', '/auth/csrf', undefined, undefined, { Origin: origin, 'X-Patron-Client': 'browser' });
  const initial = bootstrap.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
  const login = await host.request('POST', '/sessions', { email: account.email, password: PASSWORD, clientType: 'web' }, undefined, { Origin: origin, Cookie: initial, 'X-CSRF-Token': bootstrap.body.token as string });
  const cookies = login.headers.getSetCookie().map(value => value.split(';')[0]).join('; '), csrf = login.headers.get('x-csrf-token')!;
  const scopeRevision = await host.scope(account.session);
  const deleted = await host.request('POST', '/account/deletion', { operationId: randomUUID(), currentPassword: PASSWORD, phrase: 'ELIMINAR MI CUENTA', scopeRevision }, undefined, { Origin: origin, Cookie: cookies, 'X-CSRF-Token': csrf });
  expect(deleted.status).toBe(200); expect(deleted.headers.get('x-deletion-credential')).toBeNull();
  const requestId = terminal(deleted).requestId as string, cookie = deleted.headers.getSetCookie()[0]!;
  expect(cookie).toContain(`Path=/v1/deletion-status/${requestId}`); expect(cookie).toContain('Secure; HttpOnly; SameSite=Strict'); expect(cookie).not.toContain('Domain=');
  const closed = await host.request('DELETE', '/sessions/current', { operationId: randomUUID() }, undefined, { Origin: origin, Cookie: cookies+'; '+cookie.split(';')[0], 'X-CSRF-Token': csrf });
  expect(closed.status).toBe(200); expect(closed.headers.getSetCookie().every(value => !value.startsWith('__Secure-deletion-status='))).toBe(true);
  expect((await host.request('GET', `/deletion-status/${requestId}`, undefined, undefined, { Origin: origin, Cookie: cookie.split(';')[0]! })).status).toBe(200);
});
