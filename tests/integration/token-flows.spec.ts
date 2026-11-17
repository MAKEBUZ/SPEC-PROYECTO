import { createHash, randomUUID, randomBytes } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { resolve } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import type { PoolClient } from 'pg';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { migrate } from '../../apps/api/src/db/migrate.js';
import { createLocalApi } from '../../apps/api/src/http/bootstrap.js';
import { AuthModule } from '../../apps/api/src/auth/auth.module.js';
import { PasswordService } from '../../apps/api/src/auth/password.service.js';
import type { TokenDelivery, TokenDeliveryQueue } from '../../apps/api/src/auth/token-delivery.js';
import type { Credential } from '../../apps/api/src/http/access.js';

const connectionString = process.env.PATRON_TEST_DATABASE_URL;
if (!connectionString) throw new Error('Se requiere PostgreSQL efímero.');
const url = new URL(connectionString);
if (url.hostname !== '127.0.0.1' || url.pathname !== '/patron_foundation_test') throw new Error('Destino no autorizado.');
const pool = new Pool({ connectionString });
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const password = 'Una-Prueba-larga-937!';
let corpusAvailable = true;
const passwords = new PasswordService({ async has(value) { if (!corpusAvailable) throw new Error('unavailable'); return value === 'Known-Password-123!'; } });

// Test adapter only. Receipts share the business transaction; secrets stay in
// test memory. The encrypted durable adapter and delivery worker belong to T020.
class TestQueue implements TokenDeliveryQueue {
  messages: TokenDelivery[] = [];
  fail = false;
  delay = 0;
  async enqueue(client: PoolClient, delivery: TokenDelivery) {
    await client.query('INSERT INTO token_test_receipts(id) VALUES ($1)', [delivery.tokenId]);
    this.messages.push(delivery);
    if (this.delay) await new Promise(resolve => setTimeout(resolve, this.delay));
    if (this.fail) throw new Error('test queue unavailable');
  }
  async latest(recipient: string, purpose = 'verify_email') {
    for (const message of [...this.messages].reverse()) {
      if (message.recipient !== recipient || message.purpose !== purpose) continue;
      const row = await pool.query('SELECT t.id FROM token_test_receipts r JOIN one_use_tokens t ON t.id=r.id WHERE r.id=$1 AND consumed_at IS NULL AND superseded_at IS NULL AND expires_at>clock_timestamp()', [message.tokenId]);
      if (row.rowCount) return message;
    }
    throw new Error('No committed live delivery');
  }
}
const queue = new TestQueue();
const credentials = new Map<string, Credential>();
let app: INestApplication, base: string;
beforeAll(async () => {
  await migrate(pool, resolve('apps/api/src/db/migrations'));
  await pool.query('CREATE TABLE token_test_receipts(id uuid PRIMARY KEY)');
  app = await createLocalApi(AuthModule.register({ pool, passwords, delivery: queue, operationKey: randomBytes(32), operationKeyVersion: 'test-v1' }), async context => credentials.get(context.switchToHttp().getRequest().headers.authorization));
  await app.listen(0, '127.0.0.1');
  base = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}/v1`;
});
afterAll(async () => { await app?.close(); await pool.end(); });
async function request(path: string, body?: unknown, credential?: string, method = 'POST') {
  const response = await fetch(base + path, { method, signal: AbortSignal.timeout(10000), headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(credential ? { Authorization: credential } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, body: await response.json(), headers: response.headers };
}
async function register() {
  const input = { operationId: randomUUID(), email: `${randomUUID()}@example.invalid`, password };
  const reply = await request('/accounts', input);
  expect(reply.status).toBe(201);
  return { ...input, accountId: reply.body.data.accountId as string, reply };
}
async function session(accountId: string, accessClass = 'verification') {
  const id = randomUUID(), secret = randomBytes(32).toString('hex');
  await pool.query("INSERT INTO sessions(id,account_id,token_hash,access_class,started_at,expires_at) VALUES ($1,$2,$3,$4,clock_timestamp(),clock_timestamp()+interval '1 day')", [id, accountId, hash(secret), accessClass]);
  credentials.set(secret, { kind: 'session', sessionId: id, accountId, accessClass: 'verification', accountStatus: 'pending_verification', verified: false, expiresAt: Date.now()+86400000, revoked: false });
  return { id, secret };
}
async function expire(tokenId: string, hours: number) {
  await pool.query("UPDATE one_use_tokens SET issued_at=issued_at-($2*interval '1 hour'), expires_at=expires_at-($2*interval '1 hour') WHERE id=$1", [tokenId, hours]);
}
async function reset(email: string, operationId = randomUUID()) { return request('/password-reset/request', { operationId, email }); }

it('registra cuenta pendiente con Argon2, plazo 2h, secreto hash y sin sesión; repetir no reemite', async () => {
  const account = await register(), token = await queue.latest(account.email);
  const row = (await pool.query('SELECT * FROM accounts WHERE id=$1', [account.accountId])).rows[0];
  expect(row.status).toBe('pending_verification'); expect(row.verified_at).toBeNull();
  expect(await passwords.verify(row.password_hash, password)).toBe(true);
  expect(token.secret).toMatch(/^[\w-]{43}$/);
  expect(token.expiresAt.getTime()-token.issuedAt.getTime()).toBe(7200000);
  expect((await pool.query('SELECT token_hash FROM one_use_tokens WHERE id=$1', [token.tokenId])).rows[0].token_hash).toBe(hash(token.secret));
  expect((await pool.query('SELECT * FROM sessions WHERE account_id=$1', [account.accountId])).rowCount).toBe(0);
  const repeated = await request('/accounts', { operationId: account.operationId, email: account.email, password });
  expect(repeated.body).toEqual(account.reply.body);
  expect((await queue.latest(account.email)).tokenId).toBe(token.tokenId);
  const results = JSON.stringify((await pool.query('SELECT * FROM operation_results WHERE requester_id=$1', [account.accountId])).rows);
  expect(results).not.toContain(password); expect(results).not.toContain(token.secret);
  expect(account.reply.headers.get('cache-control')).toBe('no-store');
});
it('rechaza contraseña débil, conocida y correo inválido sin crear cuenta', async () => {
  for (const supplied of ['short', 'Known-Password-123!']) {
    const email = `${randomUUID()}@example.invalid`;
    expect((await request('/accounts', { operationId: randomUUID(), email, password: supplied })).body.code).toBe('PASSWORD_POLICY');
    expect((await pool.query('SELECT * FROM accounts WHERE email=$1', [email])).rowCount).toBe(0);
  }
  expect((await request('/accounts', { operationId: randomUUID(), email: 'invalid', password })).body.code).toBe('INVALID_INPUT');
});
it('serializa registros concurrentes del mismo correo y detecta cambio de carga de un operationId', async () => {
  const input = { operationId: randomUUID(), email: `${randomUUID()}@example.invalid`, password };
  const replies = await Promise.all([request('/accounts', input), request('/accounts', input)]);
  expect(replies[0].status).toBe(201); expect(replies[1].body).toEqual(replies[0].body);
  expect((await request('/accounts', { ...input, password: password+'x' })).body.code).toBe('IDEMPOTENCY_CONFLICT');
  expect((await request('/accounts', { ...input, operationId: randomUUID(), email: input.email.toUpperCase() })).body.code).toBe('INVALID_INPUT');
});
it('GET no consume; confirmaciones concurrentes producen un efecto y replay conserva resultado', async () => {
  const account = await register(), token = await queue.latest(account.email);
  expect((await request('/email-verification/confirm?token='+token.secret, undefined, undefined, 'GET')).status).toBe(404);
  const inputs = [0,1].map(() => ({ operationId: randomUUID(), token: token.secret }));
  const replies = await Promise.all(inputs.map(input => request('/email-verification/confirm', input)));
  expect(replies.map(reply => reply.status).sort()).toEqual([200,400]);
  const index = replies.findIndex(reply => reply.status === 200);
  expect(replies[index]!.body.data).toEqual({ verified: true, loginRequired: true });
  expect((await request('/email-verification/confirm', inputs[index])).body).toEqual(replies[index]!.body);
  expect((await pool.query('SELECT status FROM accounts WHERE id=$1', [account.accountId])).rows[0].status).toBe('active');
});
it('reenvío autorizado sustituye enlace y no amplía su plazo al repetir; revalida sesión en DB', async () => {
  const account = await register(), old = await queue.latest(account.email), auth = await session(account.accountId);
  const input = { operationId: randomUUID() };
  expect((await request('/email-verification/request', input)).status).toBe(401);
  expect((await request('/email-verification/request', input, auth.secret)).status).toBe(200);
  const latest = await queue.latest(account.email); expect(latest.tokenId).not.toBe(old.tokenId);
  expect((await request('/email-verification/request', input, auth.secret)).status).toBe(200);
  expect((await queue.latest(account.email)).tokenId).toBe(latest.tokenId);
  expect((await request('/email-verification/confirm', { operationId: randomUUID(), token: old.secret })).body.code).toBe('TOKEN_INVALID');
  await pool.query('UPDATE sessions SET revoked_at=clock_timestamp() WHERE id=$1', [auth.id]);
  expect((await request('/email-verification/request', { operationId: randomUUID() }, auth.secret)).body.code).toBe('SESSION_REVOKED');
});
it('enlace vencido no verifica ni invalida sesiones', async () => {
  const account = await register(), token = await queue.latest(account.email), auth = await session(account.accountId);
  await expire(token.tokenId, 3);
  expect((await request('/email-verification/confirm', { operationId: randomUUID(), token: token.secret })).body.code).toBe('TOKEN_EXPIRED');
  expect((await pool.query('SELECT revoked_at FROM sessions WHERE id=$1', [auth.id])).rows[0].revoked_at).toBeNull();
});
it('reset da la misma respuesta genérica para conocido/desconocido, dura 30min y sustituye anterior', async () => {
  const account = await register(), operationId = randomUUID();
  const known = await reset(account.email, operationId), unknown = await reset(`${randomUUID()}@example.invalid`, operationId);
  expect(known.status).toBe(202); expect(known.body).toEqual(unknown.body);
  const first = await queue.latest(account.email, 'reset_password');
  expect(first.expiresAt.getTime()-first.issuedAt.getTime()).toBe(1800000);
  await reset(account.email, operationId); expect((await queue.latest(account.email, 'reset_password')).tokenId).toBe(first.tokenId);
  await reset(account.email); const next = await queue.latest(account.email, 'reset_password'); expect(next.tokenId).not.toBe(first.tokenId);
  expect((await request('/password-reset/confirm', { operationId: randomUUID(), token: first.secret, newPassword: password+'new' })).body.code).toBe('TOKEN_INVALID');
});
it('reset débil o sin corpus no consume token; éxito cambia hash y revoca todas sin iniciar sesión', async () => {
  const account = await register(); await session(account.accountId); await session(account.accountId, 'normal'); await reset(account.email);
  const token = await queue.latest(account.email, 'reset_password');
  expect((await request('/password-reset/confirm', { operationId: randomUUID(), token: token.secret, newPassword: 'weak' })).body.code).toBe('PASSWORD_POLICY');
  corpusAvailable = false;
  try { expect((await request('/password-reset/confirm', { operationId: randomUUID(), token: token.secret, newPassword: password+'new' })).status).toBe(500); }
  finally { corpusAvailable = true; }
  const input = { operationId: randomUUID(), token: token.secret, newPassword: password+'new' };
  const reply = await request('/password-reset/confirm', input);
  expect(reply.status).toBe(200); expect(reply.body.data.loginRequired).toBe(true);
  expect((await request('/password-reset/confirm', input)).body).toEqual(reply.body);
  expect((await request('/password-reset/confirm', { ...input, operationId: randomUUID() })).body.code).toBe('TOKEN_INVALID');
  const rows = (await pool.query('SELECT revoked_at FROM sessions WHERE account_id=$1', [account.accountId])).rows;
  expect(rows).toHaveLength(2); expect(rows.every(row => row.revoked_at !== null)).toBe(true);
  const row = (await pool.query('SELECT password_hash,verified_at FROM accounts WHERE id=$1', [account.accountId])).rows[0];
  expect(await passwords.verify(row.password_hash, password+'new')).toBe(true); expect(await passwords.verify(row.password_hash, password)).toBe(false); expect(row.verified_at).toBeNull();
});
it('reset vencido conserva contraseña y sesión; propósito incorrecto no consume', async () => {
  const account = await register(), verification = await queue.latest(account.email), auth = await session(account.accountId);
  expect((await request('/password-reset/confirm', { operationId: randomUUID(), token: verification.secret, newPassword: password+'new' })).body.code).toBe('TOKEN_INVALID');
  await reset(account.email); const token = await queue.latest(account.email, 'reset_password'); await expire(token.tokenId, 1);
  expect((await request('/password-reset/confirm', { operationId: randomUUID(), token: token.secret, newPassword: password+'new' })).body.code).toBe('TOKEN_EXPIRED');
  expect((await pool.query('SELECT revoked_at FROM sessions WHERE id=$1', [auth.id])).rows[0].revoked_at).toBeNull();
});
it('fallo de cola revierte registro o reemplazo y permite reintentar sin perder enlace anterior', async () => {
  const account = await register(), old = await queue.latest(account.email), auth = await session(account.accountId);
  const input = { operationId: randomUUID() }, email = `${randomUUID()}@example.invalid`;
  queue.fail = true;
  try {
    expect((await request('/accounts', { operationId: randomUUID(), email, password })).status).toBe(500);
    expect((await request('/email-verification/request', input, auth.secret)).status).toBe(500);
  } finally { queue.fail = false; }
  expect((await pool.query('SELECT * FROM accounts WHERE email=$1', [email])).rowCount).toBe(0);
  expect((await queue.latest(account.email)).tokenId).toBe(old.tokenId);
  expect((await request('/email-verification/request', input, auth.secret)).status).toBe(200);
});
it('restablecer durante recuperación conserva eliminación y plazo; después del plazo rechaza', async () => {
  const account = await register();
  await pool.query("UPDATE accounts SET status='deletion_pending',deletion_deadline=clock_timestamp()+interval '1 day' WHERE id=$1", [account.accountId]);
  const before = (await pool.query('SELECT deletion_deadline FROM accounts WHERE id=$1', [account.accountId])).rows[0];
  await reset(account.email); const first = await queue.latest(account.email, 'reset_password');
  expect((await request('/password-reset/confirm', { operationId: randomUUID(), token: first.secret, newPassword: password+'new' })).status).toBe(200);
  const after = (await pool.query('SELECT status,deletion_deadline FROM accounts WHERE id=$1', [account.accountId])).rows[0];
  expect(after.status).toBe('deletion_pending'); expect(after.deletion_deadline).toEqual(before.deletion_deadline);
  await reset(account.email); const second = await queue.latest(account.email, 'reset_password');
  await pool.query("UPDATE accounts SET deletion_deadline=clock_timestamp()-interval '1 second' WHERE id=$1", [account.accountId]);
  expect((await request('/password-reset/confirm', { operationId: randomUUID(), token: second.secret, newPassword: password+'next' })).body.code).toBe('RETENTION_EXPIRED');
});
it('concurrencia de reset produce un único cambio y no acepta otro payload para el mismo intento', async () => {
  const account = await register(); await reset(account.email);
  const token = await queue.latest(account.email, 'reset_password');
  const inputs = ['uno', 'dos'].map(suffix => ({ operationId: randomUUID(), token: token.secret, newPassword: password+suffix }));
  const replies = await Promise.all(inputs.map(input => request('/password-reset/confirm', input)));
  expect(replies.map(reply => reply.status).sort()).toEqual([200,400]);
  const winner = inputs[replies.findIndex(reply => reply.status === 200)]!;
  expect((await request('/password-reset/confirm', { ...winner, newPassword: password+'different' })).body.code).toBe('IDEMPOTENCY_CONFLICT');
  const row = (await pool.query('SELECT password_hash FROM accounts WHERE id=$1', [account.accountId])).rows[0];
  expect(await passwords.verify(row.password_hash, winner.newPassword)).toBe(true);
});
it('GET de reset no consume y un token que vence durante Argon2 no cambia contraseña', async () => {
  const account = await register(); await reset(account.email);
  const token = await queue.latest(account.email, 'reset_password');
  expect((await request('/password-reset/confirm?token='+token.secret, undefined, undefined, 'GET')).status).toBe(404);
  const originalHash = passwords.hashNew.bind(passwords);
  const spy = vi.spyOn(passwords, 'hashNew').mockImplementationOnce(async value => {
    await expire(token.tokenId, 1);
    return originalHash(value);
  });
  try { expect((await request('/password-reset/confirm', { operationId: randomUUID(), token: token.secret, newPassword: password+'new' })).body.code).toBe('TOKEN_EXPIRED'); }
  finally { spy.mockRestore(); }
  const row = (await pool.query('SELECT password_hash FROM accounts WHERE id=$1', [account.accountId])).rows[0];
  expect(await passwords.verify(row.password_hash, password)).toBe(true);
  expect((await pool.query('SELECT consumed_at FROM one_use_tokens WHERE id=$1', [token.tokenId])).rows[0].consumed_at).toBeNull();
});
it('vencimiento de sesión mientras se encola revierte el reemplazo y el resultado', async () => {
  const account = await register(), old = await queue.latest(account.email);
  const id = randomUUID(), secret = randomUUID();
  await pool.query("INSERT INTO sessions(id,account_id,token_hash,access_class,started_at,expires_at) VALUES ($1,$2,$3,'verification',clock_timestamp(),clock_timestamp()+interval '200 milliseconds')", [id, account.accountId, hash(secret)]);
  credentials.set(secret, { kind: 'session', sessionId: id, accountId: account.accountId, accessClass: 'verification', accountStatus: 'pending_verification', verified: false, revoked: false, expiresAt: Date.now()+86400000 });
  const operationId = randomUUID(); queue.delay = 300;
  try { expect((await request('/email-verification/request', { operationId }, secret)).body.code).toBe('SESSION_EXPIRED'); }
  finally { queue.delay = 0; }
  expect((await queue.latest(account.email)).tokenId).toBe(old.tokenId);
  expect((await pool.query('SELECT * FROM operation_results WHERE operation_id=$1', [operationId])).rowCount).toBe(0);
});
it('error de base al revocar sesiones revierte también contraseña y consumo del reset', async () => {
  const account = await register(), auth = await session(account.accountId); await reset(account.email);
  const token = await queue.latest(account.email, 'reset_password');
  // Scope the fault to this account; no production schema/migration is changed.
  await pool.query(`CREATE FUNCTION token_test_revoke_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.account_id='${account.accountId}'::uuid THEN RAISE EXCEPTION 'injected failure'; END IF; RETURN NEW; END; $$`);
  await pool.query('CREATE TRIGGER token_test_revoke_failure BEFORE UPDATE ON sessions FOR EACH ROW EXECUTE FUNCTION token_test_revoke_failure()');
  const input = { operationId: randomUUID(), token: token.secret, newPassword: password+'new' };
  try { expect((await request('/password-reset/confirm', input)).status).toBe(500); }
  finally { await pool.query('DROP TRIGGER token_test_revoke_failure ON sessions'); await pool.query('DROP FUNCTION token_test_revoke_failure()'); }
  expect((await pool.query('SELECT consumed_at FROM one_use_tokens WHERE id=$1', [token.tokenId])).rows[0].consumed_at).toBeNull();
  expect((await pool.query('SELECT revoked_at FROM sessions WHERE id=$1', [auth.id])).rows[0].revoked_at).toBeNull();
  expect(await passwords.verify((await pool.query('SELECT password_hash FROM accounts WHERE id=$1', [account.accountId])).rows[0].password_hash, password)).toBe(true);
  expect((await request('/password-reset/confirm', input)).status).toBe(200);
});
it('el vencimiento durante la revocación revierte todos los efectos antes de confirmar', async () => {
  const account = await register(), auth = await session(account.accountId); await reset(account.email);
  const token = await queue.latest(account.email, 'reset_password');
  await pool.query(`CREATE FUNCTION token_test_revoke_delay() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.account_id='${account.accountId}'::uuid THEN PERFORM pg_sleep(0.3); END IF; RETURN NEW; END; $$`);
  await pool.query('CREATE TRIGGER token_test_revoke_delay BEFORE UPDATE ON sessions FOR EACH ROW EXECUTE FUNCTION token_test_revoke_delay()');
  await pool.query("WITH instant AS MATERIALIZED (SELECT clock_timestamp()+interval '200 milliseconds' AS deadline) UPDATE one_use_tokens SET issued_at=deadline-interval '30 minutes',expires_at=deadline FROM instant WHERE id=$1", [token.tokenId]);
  try { expect((await request('/password-reset/confirm', { operationId: randomUUID(), token: token.secret, newPassword: password+'new' })).body.code).toBe('TOKEN_EXPIRED'); }
  finally { await pool.query('DROP TRIGGER token_test_revoke_delay ON sessions'); await pool.query('DROP FUNCTION token_test_revoke_delay()'); }
  expect((await pool.query('SELECT consumed_at FROM one_use_tokens WHERE id=$1', [token.tokenId])).rows[0].consumed_at).toBeNull();
  expect((await pool.query('SELECT revoked_at FROM sessions WHERE id=$1', [auth.id])).rows[0].revoked_at).toBeNull();
  expect(await passwords.verify((await pool.query('SELECT password_hash FROM accounts WHERE id=$1', [account.accountId])).rows[0].password_hash, password)).toBe(true);
});
