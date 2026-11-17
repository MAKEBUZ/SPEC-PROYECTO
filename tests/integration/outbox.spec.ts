import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { Pool } from 'pg';
import { beforeAll, afterAll, expect, it } from 'vitest';
import { migrate } from '../../apps/api/src/db/migrate.js';
import { inTransaction } from '../../apps/api/src/db/transaction.js';
import { createIdentity, replaceToken, consumeToken } from '../../apps/api/src/db/identity.js';
import { OutboxQueue, OutboxWorker } from '../../apps/api/src/mail/outbox.worker.js';
import { CaptureMailTransport } from '../../apps/api/src/mail/mail-transport.js';
import type { TokenDelivery } from '../../apps/api/src/auth/token-delivery.js';
import { AuthModule } from '../../apps/api/src/auth/auth.module.js';
import { createLocalApi } from '../../apps/api/src/http/bootstrap.js';
import { PasswordService } from '../../apps/api/src/auth/password.service.js';
import type { AddressInfo } from 'node:net';

const connectionString = process.env.PATRON_TEST_DATABASE_URL;
if (!connectionString) throw new Error('Requiere PostgreSQL efímero.');
const target = new URL(connectionString);
if (target.hostname !== '127.0.0.1' || target.pathname !== '/patron_foundation_test') throw new Error('Destino no autorizado.');
const pool = new Pool({ connectionString });
const key = randomBytes(32), keys = new Map([['v1', key]]);
const queue = new OutboxQueue('v1', keys);
const mail = new CaptureMailTransport();
const worker = () => new OutboxWorker(pool, keys, mail, 'https://patron.example.invalid');
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
beforeAll(async () => { await migrate(pool, resolve('apps/api/src/db/migrations')); });
afterAll(async () => { await pool.end(); });
async function emit(accountId?: string): Promise<TokenDelivery> {
  return inTransaction(pool, async client => {
    const id = accountId ?? await createIdentity(client, `${randomUUID()}@example.invalid`, 'test-hash');
    const recipient = (await client.query('SELECT email FROM accounts WHERE id=$1', [id])).rows[0].email as string;
    const secret = randomBytes(32).toString('base64url');
    const token = await replaceToken(client, id, 'verify_email', hash(secret));
    const delivery = { accountId: id, recipient, tokenId: token.id, purpose: 'verify_email' as const, secret, issuedAt: token.issuedAt, expiresAt: token.expiresAt };
    await queue.enqueue(client, delivery);
    return delivery;
  });
}
async function row(id: string) { return (await pool.query('SELECT * FROM outbox_jobs WHERE token_id=$1', [id])).rows[0]; }

it('no entrega antes del commit ni después de rollback', async () => {
  const client = await pool.connect();
  let id = '';
  try {
    await client.query('BEGIN');
    const accountId = await createIdentity(client, `${randomUUID()}@example.invalid`, 'test');
    const secret = randomBytes(32).toString('base64url'), token = await replaceToken(client, accountId, 'reset_password', hash(secret)); id = token.id;
    await queue.enqueue(client, { tokenId: id, accountId, recipient: `${randomUUID()}@example.invalid`, purpose: 'reset_password', secret, issuedAt: token.issuedAt, expiresAt: token.expiresAt });
    const before = mail.messages.length; await worker().dispatchPending(); expect(mail.messages.length).toBe(before);
    await client.query('ROLLBACK');
    await worker().dispatchPending(); expect(await row(id)).toBeUndefined(); expect(mail.messages.length).toBe(before);
  } finally { await client.query('ROLLBACK'); client.release(); }
});
it('cifra payload, deduplica y entrega después de reiniciar worker, borrando el secreto', async () => {
  const delivery = await emit();
  await inTransaction(pool, client => queue.enqueue(client, delivery));
  const stored = await row(delivery.tokenId);
  expect(JSON.stringify(stored)).not.toContain(delivery.secret); expect(JSON.stringify(stored)).not.toContain(delivery.recipient);
  expect((await pool.query('SELECT * FROM outbox_jobs WHERE token_id=$1', [delivery.tokenId])).rowCount).toBe(1);
  const before = mail.messages.length;
  await Promise.all([worker().dispatchPending(), worker().dispatchPending()]);
  expect(mail.messages.length).toBe(before+1);
  expect(mail.messages.at(-1)?.text).toContain(encodeURIComponent(delivery.secret));
  expect(await row(delivery.tokenId)).toMatchObject({ state: 'delivered', payload: null, nonce: null, auth_tag: null });
  await inTransaction(pool, client => queue.enqueue(client, delivery));
  expect(await row(delivery.tokenId)).toMatchObject({ state: 'delivered', payload: null });
  await worker().dispatchPending(); expect(mail.messages.length).toBe(before+1);
});
it('el envío en curso serializa el reemplazo y dos workers no entregan simultáneamente', async () => {
  const first = await emit();
  let began!: () => void, release!: () => void;
  const started = new Promise<void>(resolve => { began = resolve; });
  const gate = new Promise<void>(resolve => { release = resolve; });
  const capture = new CaptureMailTransport();
  const slow = new OutboxWorker(pool, keys, { async send(message) { began(); await gate; await capture.send(message); } }, 'https://patron.example.invalid');
  const dispatch = slow.dispatchPending();
  await started;
  const replacement = emit(first.accountId);
  try {
    await worker().dispatchPending();
    expect(capture.messages).toHaveLength(0);
  } finally { release(); }
  await dispatch; const next = await replacement;
  expect(capture.messages).toHaveLength(1);
  expect(await row(first.tokenId)).toMatchObject({ state: 'delivered', payload: null });
  expect(await row(next.tokenId)).toMatchObject({ state: 'pending' });
  await worker().dispatchPending();
  expect(await row(next.tokenId)).toMatchObject({ state: 'delivered', payload: null });
});
it('reemplazar o consumir invalida y borra payload sin reenviar el enlace anterior', async () => {
  const first = await emit(), next = await emit(first.accountId);
  expect(await row(first.tokenId)).toMatchObject({ state: 'invalidated', payload: null });
  await inTransaction(pool, client => consumeToken(client, next.accountId, next.purpose, hash(next.secret), async () => true));
  expect(await row(next.tokenId)).toMatchObject({ state: 'invalidated', payload: null });
  const before = mail.messages.length; await worker().dispatchPending(); expect(mail.messages.length).toBe(before);
});
it('fallo de transporte conserva payload cifrado y programa reintento sin reemitir token', async () => {
  const delivery = await emit();
  const failing = new OutboxWorker(pool, keys, { async send() { throw new Error('provider includes secret that must not be persisted'); } }, 'https://patron.example.invalid');
  await failing.dispatchPending();
  const stored = await row(delivery.tokenId); expect(stored.state).toBe('pending'); expect(stored.attempts).toBe(1); expect(stored.payload).not.toBeNull();
  expect(JSON.stringify(stored)).not.toContain('provider includes');
  const before = mail.messages.length; await worker().dispatchPending(); expect(mail.messages.length).toBe(before);
  await pool.query("UPDATE outbox_jobs SET next_attempt_at=clock_timestamp()-interval '1 second' WHERE token_id=$1", [delivery.tokenId]);
  await worker().dispatchPending(); expect(mail.messages.length).toBe(before+1); expect(await row(delivery.tokenId)).toMatchObject({ state: 'delivered', payload: null, attempts: 2 });
});
it('vence y elimina secretos aunque el siguiente intento todavía no corresponda', async () => {
  const delivery = await emit();
  await pool.query("UPDATE outbox_jobs SET next_attempt_at=clock_timestamp()+interval '1 day' WHERE token_id=$1", [delivery.tokenId]);
  await pool.query("UPDATE one_use_tokens SET issued_at=issued_at-interval '3 hours',expires_at=expires_at-interval '3 hours' WHERE id=$1", [delivery.tokenId]);
  const before = mail.messages.length; await worker().dispatchPending(); expect(mail.messages.length).toBe(before);
  expect(await row(delivery.tokenId)).toMatchObject({ state: 'invalidated', payload: null });
});
it('payload alterado o clave ausente no envía ni registra secretos y puede recuperarse', async () => {
  const delivery = await emit();
  const noKey = new OutboxWorker(pool, new Map(), mail, 'https://patron.example.invalid');
  const before = mail.messages.length; await noKey.dispatchPending(); expect(mail.messages.length).toBe(before);
  const stored = await row(delivery.tokenId); expect(stored.state).toBe('pending');
  await pool.query("UPDATE outbox_jobs SET payload=$2,next_attempt_at=clock_timestamp() WHERE token_id=$1", [delivery.tokenId, Buffer.from('tampered')]);
  await worker().dispatchPending(); expect(mail.messages.length).toBe(before);
  await pool.query('UPDATE outbox_jobs SET payload=$2,next_attempt_at=clock_timestamp() WHERE token_id=$1', [delivery.tokenId, stored.payload]);
  await worker().dispatchPending(); expect(mail.messages.length).toBe(before+1);
});
it('compone HTTP real con outbox: registro, verificación y reset entregan enlaces consumibles', async () => {
  const transport = new CaptureMailTransport();
  const app = await createLocalApi(AuthModule.withOutbox({ pool, passwords: new PasswordService({ async has() { return false; } }), operationKey: randomBytes(32), operationKeyVersion: 'test', outboxKeyId: 'v1', outboxKeys: keys, mailTransport: transport, publicOrigin: 'https://patron.example.invalid' }));
  await app.listen(0, '127.0.0.1');
  try {
    const base = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}/v1`;
    const post = (path: string, fields: unknown) => fetch(base+path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(fields), signal: AbortSignal.timeout(10000) });
    const email = `${randomUUID()}@example.invalid`;
    expect((await post('/accounts', { operationId: randomUUID(), email, password: 'Una-Prueba-7592!larga' })).status).toBe(201);
    const outbox = app.get<OutboxWorker>('PATRON_OUTBOX_WORKER');
    await outbox.dispatchPending();
    const secret = () => new URL(transport.messages.at(-1)!.text.split('\n').at(-1)!).searchParams.get('token');
    expect((await post('/email-verification/confirm', { operationId: randomUUID(), token: secret() })).status).toBe(200);
    expect((await post('/password-reset/request', { operationId: randomUUID(), email })).status).toBe(202);
    await outbox.dispatchPending();
    expect((await post('/password-reset/confirm', { operationId: randomUUID(), token: secret(), newPassword: 'Otra-Prueba-7583!larga' })).status).toBe(200);
    expect(transport.messages).toHaveLength(2);
  } finally { await app.close(); }
});
