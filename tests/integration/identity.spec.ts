import { randomUUID, createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { Pool } from 'pg';
import { beforeAll, afterAll, expect, it } from 'vitest';
import { migrate } from '../../apps/api/src/db/migrate.js';
import { inTransaction } from '../../apps/api/src/db/transaction.js';
import { createIdentity, replaceToken, consumeToken } from '../../apps/api/src/db/identity.js';

const connectionString = process.env.PATRON_TEST_DATABASE_URL;
if (!connectionString) throw new Error('Se requiere PostgreSQL efímero de test:integration:local.');
const url = new URL(connectionString);
if (url.hostname !== '127.0.0.1' || url.pathname !== '/patron_foundation_test') throw new Error('Destino no autorizado.');
const pool = new Pool({ connectionString });
const email = `${randomUUID()}@example.invalid`;
let accountId: string;
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
beforeAll(async () => {
  await migrate(pool, resolve('apps/api/src/db/migrations'));
  accountId = await inTransaction(pool, client => createIdentity(client, email, 'argon2-placeholder-test'));
});
afterAll(async () => { await pool.end(); });

it('un correo existente no crea otra identidad; recrearlo tras borrado genera otro UUID', async () => {
  const ownEmail = `${randomUUID()}@example.invalid`;
  const first = await inTransaction(pool, client => createIdentity(client, ownEmail, 'hash-test'));
  await expect(inTransaction(pool, client => createIdentity(client, ownEmail.toUpperCase(), 'hash-test'))).rejects.toMatchObject({ code: '23505' });
  await pool.query('DELETE FROM accounts WHERE id=$1', [first]);
  const second = await inTransaction(pool, client => createIdentity(client, ownEmail, 'hash-test'));
  expect(second).not.toBe(first);
});

it('sustituciones simultáneas dejan exactamente un token vigente sin secretos en claro', async () => {
  const results = await Promise.all(['secret-one', 'secret-two'].map(secret => inTransaction(pool, client => replaceToken(client, accountId, 'verify_email', hash(secret)))));
  const stored = (await pool.query('SELECT * FROM one_use_tokens WHERE account_id=$1', [accountId])).rows;
  expect(stored.filter(row => row.superseded_at === null && row.consumed_at === null)).toHaveLength(1);
  expect(JSON.stringify(stored)).not.toContain('secret-one');
  for (const result of results) expect(result.expiresAt.getTime() - result.issuedAt.getTime()).toBe(7200000);
});

it('dos consumos del mismo token ejecutan una sola vez el efecto', async () => {
  const tokenHash = hash(randomUUID());
  await inTransaction(pool, client => replaceToken(client, accountId, 'reset_password', tokenHash));
  const consume = () => inTransaction(pool, client => consumeToken(client, accountId, 'reset_password', tokenHash, async () => {
    await client.query('UPDATE accounts SET used_bytes=used_bytes+1 WHERE id=$1', [accountId]);
  }));
  const results = await Promise.allSettled([consume(), consume()]);
  expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
  expect((await pool.query('SELECT used_bytes FROM accounts WHERE id=$1', [accountId])).rows[0].used_bytes).toBe('1');
});

it('un fallo del efecto revierte también el consumo del token', async () => {
  const tokenHash = hash(randomUUID());
  await inTransaction(pool, client => replaceToken(client, accountId, 'reset_password', tokenHash));
  await expect(inTransaction(pool, client => consumeToken(client, accountId, 'reset_password', tokenHash, async () => { throw new Error('rollback'); }))).rejects.toThrow('rollback');
  await expect(inTransaction(pool, client => consumeToken(client, accountId, 'reset_password', tokenHash, async () => 'ok'))).resolves.toBe('ok');
});
