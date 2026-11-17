import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { startAccountHost, terminal, rejected, PASSWORD, NEW_PASSWORD, DAY } from '../support/account-host.js';
import type { AccountHost } from '../support/account-host.js';

let host: AccountHost;
beforeAll(async () => { host = await startAccountHost(); });
afterAll(async () => { await host?.close(); });

it('FR-001/107: registrar mantiene correo pendiente, no inicia sesión ni habilita recursos', async () => {
  const account = await host.register();
  expect(await host.accountRow(account.accountId)).toMatchObject({ status: 'pending_verification', verified_at: null });
  const stored = await host.accountRow(account.accountId);
  expect(stored.password_hash).toEqual(expect.stringMatching(/^\$argon2id\$/));
  expect(JSON.stringify(stored)).not.toContain(PASSWORD);
  const session = await host.login(account.email);
  expect(session.view.accessClass).toBe('verification');
  rejected(await host.request('GET', '/account/profile', undefined, session), ['ACCOUNT_LIMITED']);
  rejected(await host.request('GET', '/projects', undefined, session), ['ACCOUNT_LIMITED']);
});

it('FR-001/003: registros simultáneos del mismo correo no crean dos cuentas', async () => {
  const email = `${randomUUID()}@example.invalid`;
  const results = await Promise.all([1, 2].map(() => host.request('POST', '/accounts', { operationId: randomUUID(), email, password: PASSWORD })));
  expect(results.filter(result => result.status === 201)).toHaveLength(1);
  expect((await host.pool.query('SELECT count(*)::int AS count FROM accounts WHERE email=$1', [email])).rows[0].count).toBe(1);
});

it('FR-002/003: credenciales válidas funcionan y contraseña incorrecta no concede sesión', async () => {
  const account = await host.verifiedAccount();
  expect(account.session.view.accessClass).toBe('normal');
  expect((await host.request('GET', '/account/profile', undefined, account.session)).body).toMatchObject({ id: account.accountId });
  const wrong = await host.request('POST', '/sessions', { email: account.email, password: 'Incorrecta-99!Prueba', clientType: 'desktop' });
  expect(wrong.status).toBe(401); expect(wrong.headers.get('authorization')).toBeNull();
});

it('FR-108: verificación vence a las dos horas sin activar ni eliminar cuenta', async () => {
  const account = await host.register(); const token = await host.latestToken(account.email);
  const row = (await host.pool.query("SELECT issued_at,expires_at FROM one_use_tokens WHERE account_id=$1 AND purpose='verify_email'", [account.accountId])).rows[0];
  expect(row.expires_at.getTime() - row.issued_at.getTime()).toBe(2 * 3600000);
  await ageToken(account.accountId, 'verify_email', 121);
  rejected(await host.request('POST', '/email-verification/confirm', { operationId: randomUUID(), token }), ['TOKEN_EXPIRED', 'TOKEN_INVALID']);
  expect(await host.accountRow(account.accountId)).toMatchObject({ status: 'pending_verification', verified_at: null });
});

it('FR-108/109: reenvío sustituye el enlace; repetir operationId no vuelve a emitir', async () => {
  const account = await host.register(); const old = await host.latestToken(account.email); const session = await host.login(account.email);
  const operationId = randomUUID();
  const first = await host.request('POST', '/email-verification/request', { operationId }, session);
  expect(first.status).toBe(200); const current = await host.latestToken(account.email);
  expect(current).not.toBe(old);
  const repeated = await host.request('POST', '/email-verification/request', { operationId }, session);
  expect(repeated.body).toEqual(first.body);
  expect(await host.latestToken(account.email)).toBe(current);
  rejected(await host.request('POST', '/email-verification/confirm', { operationId: randomUUID(), token: old }), ['TOKEN_INVALID']);
  const concurrent = await Promise.all([1, 2].map(() => host.request('POST', '/email-verification/confirm', { operationId: randomUUID(), token: current })));
  expect(concurrent.filter(result => result.status === 200 && result.body.outcome === 'success')).toHaveLength(1);
  expect((await host.accountRow(account.accountId)).verified_at).not.toBeNull();
});

it('FR-110: pedir restablecimiento no cambia contraseña y la respuesta no revela existencia', async () => {
  const account = await host.verifiedAccount(); const before = await host.accountRow(account.accountId);
  const known = await host.request('POST', '/password-reset/request', { operationId: randomUUID(), email: account.email });
  const unknown = await host.request('POST', '/password-reset/request', { operationId: randomUUID(), email: `${randomUUID()}@example.invalid` });
  expect(known.status).toBe(202); expect(unknown.status).toBe(202);
  const publicShape = (body: Record<string, unknown>) => { const { operationId: _op, traceId: _trace, ...rest } = body; return rest; };
  expect(publicShape(known.body)).toEqual(publicShape(unknown.body));
  expect(JSON.stringify(known.body)).not.toContain(account.accountId);
  expect((await host.accountRow(account.accountId)).password_hash).toBe(before.password_hash);
  expect((await host.request('GET', '/account/profile', undefined, account.session)).status).toBe(200);
});

it('FR-111: restablecer invalida todas las sesiones y no inicia sesión automáticamente', async () => {
  const account = await host.verifiedAccount(); const other = await host.login(account.email);
  expect((await host.request('POST', '/password-reset/request', { operationId: randomUUID(), email: account.email })).status).toBe(202);
  const token = await host.latestToken(account.email);
  const reset = await host.request('POST', '/password-reset/confirm', { operationId: randomUUID(), token, newPassword: NEW_PASSWORD });
  expect(reset.status).toBe(200); expect(terminal(reset)).toMatchObject({ loginRequired: true }); expect(reset.headers.get('authorization')).toBeNull();
  for (const session of [account.session, other]) rejected(await host.request('GET', '/account/profile', undefined, session), ['SESSION_REVOKED', 'SESSION_REQUIRED']);
  expect((await host.login(account.email, NEW_PASSWORD)).view.accessClass).toBe('normal');
});

it('FR-112: enlace de reset vencido conserva contraseña y sesiones', async () => {
  const account = await host.verifiedAccount(); const before = await host.accountRow(account.accountId);
  expect((await host.request('POST', '/password-reset/request', { operationId: randomUUID(), email: account.email })).status).toBe(202);
  const token = await host.latestToken(account.email);
  const row = (await host.pool.query("SELECT issued_at,expires_at FROM one_use_tokens WHERE account_id=$1 AND purpose='reset_password' AND superseded_at IS NULL", [account.accountId])).rows[0];
  expect(row.expires_at.getTime() - row.issued_at.getTime()).toBe(1800000);
  await ageToken(account.accountId, 'reset_password', 31);
  rejected(await host.request('POST', '/password-reset/confirm', { operationId: randomUUID(), token, newPassword: NEW_PASSWORD }), ['TOKEN_EXPIRED', 'TOKEN_INVALID']);
  expect((await host.accountRow(account.accountId)).password_hash).toBe(before.password_hash);
  expect((await host.request('GET', '/account/profile', undefined, account.session)).status).toBe(200);
});

it('FR-113: reemplazar reset invalida anterior, mantiene contraseña y consume nuevo una sola vez', async () => {
  const account = await host.verifiedAccount();
  await host.request('POST', '/password-reset/request', { operationId: randomUUID(), email: account.email }); const first = await host.latestToken(account.email);
  await host.request('POST', '/password-reset/request', { operationId: randomUUID(), email: account.email }); const second = await host.latestToken(account.email);
  expect(second).not.toBe(first);
  rejected(await host.request('POST', '/password-reset/confirm', { operationId: randomUUID(), token: first, newPassword: NEW_PASSWORD }), ['TOKEN_INVALID']);
  expect((await host.request('GET', '/account/profile', undefined, account.session)).status).toBe(200);
  const results = await Promise.all([1, 2].map(() => host.request('POST', '/password-reset/confirm', { operationId: randomUUID(), token: second, newPassword: NEW_PASSWORD })));
  expect(results.filter(result => result.status === 200 && result.body.outcome === 'success')).toHaveLength(1);
});

it('FR-115: actividad no extiende el máximo de siete días y una sesión vencida no accede a la cuenta', async () => {
  const account = await host.verifiedAccount(); const session = account.session;
  const lifetime = Date.parse(session.view.expiresAt) - Date.parse(session.view.startedAt);
  expect(lifetime).toBeGreaterThan(0); expect(lifetime).toBeLessThanOrEqual(7 * DAY);
  await host.request('GET', '/account/profile', undefined, session);
  const stored = (await host.pool.query('SELECT expires_at FROM sessions WHERE id=$1', [session.view.id])).rows[0];
  expect(stored.expires_at.toISOString()).toBe(session.view.expiresAt);
  // Replace only the synthetic fixture row with its naturally expired state;
  // do not disable the immutability trigger or change the computer/server clock.
  await host.pool.query(`WITH original AS (DELETE FROM sessions WHERE id=$1 RETURNING *), instant AS MATERIALIZED (SELECT clock_timestamp() AS now)
    INSERT INTO sessions(id,account_id,token_hash,access_class,started_at,expires_at,revoked_at)
    SELECT original.id,account_id,token_hash,access_class,now-interval '7 days 1 second',now-interval '1 second',revoked_at FROM original,instant`, [session.view.id]);
  rejected(await host.request('GET', '/account/profile', undefined, session), ['SESSION_EXPIRED']);
});

it('FR-117/118: cerrar la actual conserva otra; cerrar todas exige confirmación y revoca ambas', async () => {
  const account = await host.verifiedAccount(); const second = await host.login(account.email);
  expect((await host.request('DELETE', '/sessions/current', { operationId: randomUUID() }, account.session)).status).toBe(200);
  rejected(await host.request('GET', '/account/profile', undefined, account.session), ['SESSION_REVOKED', 'SESSION_REQUIRED']);
  expect((await host.request('GET', '/account/profile', undefined, second)).status).toBe(200);
  rejected(await host.request('POST', '/sessions/revoke-all', { operationId: randomUUID(), confirmation: false }, second), ['INVALID_INPUT']);
  const third = await host.login(account.email);
  expect((await host.request('POST', '/sessions/revoke-all', { operationId: randomUUID(), confirmation: true }, second)).status).toBe(200);
  for (const session of [second, third]) rejected(await host.request('GET', '/account/profile', undefined, session), ['SESSION_REVOKED', 'SESSION_REQUIRED']);
});

it('FR-125: sesión revocada no modifica perfil', async () => {
  const account = await host.verifiedAccount(); const before = await host.accountRow(account.accountId);
  await host.request('DELETE', '/sessions/current', { operationId: randomUUID() }, account.session);
  rejected(await host.request('PATCH', '/account/profile', { operationId: randomUUID(), displayName: 'Cambio rechazado' }, account.session), ['SESSION_REVOKED', 'SESSION_REQUIRED']);
  expect((await host.accountRow(account.accountId)).display_name).toBe(before.display_name);
});

it.each(['Corta1!', 'a'.repeat(129), 'sinmayusculas123!', 'SINMINUSCULAS123!', 'SinNumeros!!Texto', 'SinSimbolos12345'])('FR-114: rechaza contraseña que no cumple política en registro', async password => {
  const response = await host.request('POST', '/accounts', { operationId: randomUUID(), email: `${randomUUID()}@example.invalid`, password });
  rejected(response, ['PASSWORD_POLICY']);
});

it('FR-114: contraseña rechazada no consume enlace de reset ni cambia la anterior', async () => {
  const account = await host.verifiedAccount(); const before = await host.accountRow(account.accountId);
  await host.request('POST', '/password-reset/request', { operationId: randomUUID(), email: account.email }); const token = await host.latestToken(account.email);
  rejected(await host.request('POST', '/password-reset/confirm', { operationId: randomUUID(), token, newPassword: 'débil' }), ['PASSWORD_POLICY']);
  expect((await host.accountRow(account.accountId)).password_hash).toBe(before.password_hash);
  expect((await host.request('POST', '/password-reset/confirm', { operationId: randomUUID(), token, newPassword: NEW_PASSWORD })).status).toBe(200);
});

it('FR-114: rechaza una contraseña del corpus incluso si cumple longitud y composición', async () => {
  const input = createReadStream('.local/assets/passwords.txt', { encoding: 'utf8' });
  const lines = createInterface({ input, crlfDelay: Infinity });
  let known: string | undefined;
  try {
    for await (const line of lines) {
      const length = [...line].length;
      if (line.isWellFormed() && length >= 12 && length <= 128 && /\p{Lu}/u.test(line) && /\p{Ll}/u.test(line) && /\p{Nd}/u.test(line) && /[\p{P}\p{S}]/u.test(line)) { known = line; break; }
    }
  } finally { lines.close(); input.destroy(); }
  expect(known, 'Se requiere un caso real del corpus que satisfaga las otras reglas').toBeDefined();
  rejected(await host.request('POST', '/accounts', { operationId: randomUUID(), email: `${randomUUID()}@example.invalid`, password: known }), ['PASSWORD_POLICY']);
}, 20000);

it('FR-116/119: invalidación remota tardía de sesión cerrada no revoca un nuevo inicio', async () => {
  const account = await host.verifiedAccount(); const newSession = await host.login(account.email);
  const operationId = randomUUID();
  const first = await host.request('DELETE', '/sessions/current', { operationId }, account.session);
  expect(first.status).toBe(200);
  const replay = await host.request('DELETE', '/sessions/current', { operationId }, account.session);
  expect(replay.body).toEqual(first.body);
  expect((await host.request('GET', '/account/profile', undefined, newSession)).status).toBe(200);
  rejected(await host.request('GET', '/account/profile', undefined, account.session), ['SESSION_REQUIRED', 'SESSION_REVOKED']);
});

it('FR-125: revocación confirmada antes del commit rechaza un cambio iniciado con sesión válida', async () => {
  const account = await host.verifiedAccount(); const before = await host.accountRow(account.accountId);
  const blocker = await host.pool.connect();
  let pending: ReturnType<AccountHost['request']> | undefined;
  try {
    await blocker.query('BEGIN');
    await blocker.query('SELECT id FROM accounts WHERE id=$1 FOR UPDATE', [account.accountId]);
    pending = host.request('PATCH', '/account/profile', { operationId: randomUUID(), displayName: 'No confirmar' }, account.session);
    const deadline = Date.now() + 3000;
    let blocked = false;
    while (Date.now() < deadline) {
      const waiting = await blocker.query("SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND wait_event_type='Lock'");
      if (waiting.rows[0].count > 0) { blocked = true; break; }
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    expect(blocked, 'La mutación debe esperar el bloqueo de cuenta antes de confirmar').toBe(true);
    await blocker.query('UPDATE sessions SET revoked_at=clock_timestamp() WHERE id=$1', [account.session.view.id]);
    await blocker.query('COMMIT');
    rejected(await pending, ['SESSION_REVOKED', 'SESSION_REQUIRED']);
    expect((await host.accountRow(account.accountId)).display_name).toBe(before.display_name);
  } finally { await blocker.query('ROLLBACK'); blocker.release(); await pending?.catch(() => undefined); }
});

async function ageToken(accountId: string, purpose: string, minutes: number) {
  await host.pool.query(`WITH instant AS MATERIALIZED (SELECT clock_timestamp()-($3::int*interval '1 minute') AS issued)
    UPDATE one_use_tokens SET issued_at=issued,expires_at=issued+CASE WHEN purpose='verify_email' THEN interval '2 hours' ELSE interval '30 minutes' END
    FROM instant WHERE account_id=$1 AND purpose=$2 AND consumed_at IS NULL AND superseded_at IS NULL`, [accountId, purpose, minutes]);
}
