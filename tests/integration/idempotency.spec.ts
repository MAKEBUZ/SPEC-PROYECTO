import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { Pool } from 'pg';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { migrate } from '../../apps/api/src/db/migrate.js';
import { inTransaction } from '../../apps/api/src/db/transaction.js';
import { requestDigest, runOperation } from '../../apps/api/src/operations/operation.service.js';

const connectionString = process.env.PATRON_TEST_DATABASE_URL;
if (!connectionString) throw new Error('Ejecuta npm run test:integration:local para crear PostgreSQL aislado.');
const target = new URL(connectionString);
if (target.hostname !== '127.0.0.1' || target.pathname !== '/patron_foundation_test') throw new Error('Base de pruebas no autorizada.');
const pool = new Pool({ connectionString, max: 8, connectionTimeoutMillis: 5000 });
const accountId = randomUUID();
const migrationNames=['001-identity.sql','002-operations.sql','003-outbox.sql','004-projects.sql','005-publications.sql','006-trash.sql','007-deletion-check.sql','008-pdf-measurements.sql'];
beforeAll(async () => {
  await migrate(pool, resolve('apps/api/src/db/migrations'));
  await migrate(pool, resolve('apps/api/src/db/migrations'));
  await pool.query("INSERT INTO accounts(id,email,password_hash,status) VALUES ($1,$2,'test-hash','active')", [accountId, `${accountId}@example.invalid`]);
}, 30000);
afterAll(async () => { await pool.end(); });

it('migra una sola vez y revierte toda la transacción fallida', async () => {
  expect((await pool.query('SELECT name FROM schema_migrations ORDER BY name')).rows.map(r=>r.name)).toEqual(migrationNames);
  await expect(inTransaction(pool, async client => {
    await client.query('UPDATE accounts SET used_bytes=10 WHERE id=$1', [accountId]);
    throw new Error('failure');
  })).rejects.toThrow('failure');
  expect((await pool.query('SELECT used_bytes FROM accounts WHERE id=$1', [accountId])).rows[0].used_bytes).toBe('0');
});

it('serializa duplicados concurrentes sin repetir la mutación', async () => {
  const key = { requesterId: accountId, operationType: 'foundation.test', operationId: randomUUID() };
  const digest = requestDigest({ value: 1 }, Buffer.alloc(32, 1), 'v1');
  const perform = () => inTransaction(pool, client => runOperation(client, key, digest, async () => {
    await client.query('UPDATE accounts SET used_bytes=used_bytes+1 WHERE id=$1', [accountId]);
    return { outcome: 'success', data: { accepted: true } };
  }));
  const results = await Promise.all(Array.from({ length: 6 }, perform));
  expect(results.every(result => JSON.stringify(result) === JSON.stringify(results[0]))).toBe(true);
  expect((await pool.query('SELECT used_bytes FROM accounts WHERE id=$1', [accountId])).rows[0].used_bytes).toBe('1');
  await expect(inTransaction(pool, client => runOperation(client, key, 'v1:different', async () => {
    throw new Error('No debe ejecutarse');
  }))).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
});

it('revierte reserva de idempotencia y efecto juntos', async () => {
  const key = { requesterId: accountId, operationType: 'foundation.rollback', operationId: randomUUID() };
  await expect(inTransaction(pool, client => runOperation(client, key, 'v1:test', async () => {
    await client.query('UPDATE accounts SET used_bytes=100 WHERE id=$1', [accountId]);
    throw new Error('rollback');
  }))).rejects.toThrow('rollback');
  expect((await pool.query('SELECT count(*)::int AS count FROM operation_results WHERE operation_id=$1', [key.operationId])).rows[0].count).toBe(0);
  expect((await pool.query('SELECT used_bytes FROM accounts WHERE id=$1', [accountId])).rows[0].used_bytes).not.toBe('100');
});

it('impide cuotas negativas y renovación del plazo de sesión', async () => {
  await expect(pool.query('UPDATE accounts SET reserved_bytes=-1 WHERE id=$1', [accountId])).rejects.toMatchObject({ code: '23514' });
  const sessionId = randomUUID();
  await pool.query("INSERT INTO sessions(id,account_id,token_hash,access_class,started_at,expires_at) VALUES ($1,$2,$3,'normal','2026-01-01Z','2026-01-08Z')", [sessionId, accountId, randomUUID()]);
  await expect(pool.query("UPDATE sessions SET expires_at=expires_at+interval '1 second' WHERE id=$1", [sessionId])).rejects.toThrow();
});

it('impide dos tokens vigentes del mismo propósito', async () => {
  const insert = () => pool.query("INSERT INTO one_use_tokens(id,account_id,purpose,token_hash,issued_at,expires_at) VALUES ($1,$2,'reset_password',$3,'2026-01-01Z','2026-01-01T00:30:00Z')", [randomUUID(), accountId, randomUUID()]);
  const results = await Promise.allSettled([insert(), insert()]);
  expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
  expect(results.filter(result => result.status === 'rejected')).toHaveLength(1);
});

it('rechaza una migración aplicada modificada sin alterar los datos', async () => {
  const directory = await mkdtemp(resolve(tmpdir(), 'patron-migration-'));
  try {
    for (const name of migrationNames) {
      const source = await readFile(resolve('apps/api/src/db/migrations', name), 'utf8');
      await writeFile(resolve(directory, name), source + '\n-- altered');
    }
    await expect(migrate(pool, directory)).rejects.toThrow('modificada');
    expect((await pool.query('SELECT name FROM schema_migrations ORDER BY name')).rows.map(r=>r.name)).toEqual(migrationNames);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
