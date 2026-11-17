import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { ValidationError } from '../../../../packages/contracts/src/validation.js';

export type TokenPurpose = 'verify_email' | 'reset_password';
function validateHash(hash: string): void {
  if (!/^[a-f0-9]{64}$/.test(hash)) throw new ValidationError('INVALID_INPUT');
}
// Internal persistence primitives: the caller owns the transaction and validates
// account state/password policy. IDs and timestamps are never supplied by clients.
export async function createIdentity(client: PoolClient, email: string, passwordHash: string, displayName?: string): Promise<string> {
  const id = randomUUID();
  await client.query("INSERT INTO accounts(id,email,password_hash,display_name,status) VALUES ($1,$2,$3,$4,'pending_verification')", [id, email.trim().toLowerCase(), passwordHash, displayName ?? null]);
  return id;
}

async function lockAccount(client: PoolClient, accountId: string): Promise<void> {
  const account = await client.query('SELECT id FROM accounts WHERE id=$1 FOR UPDATE', [accountId]);
  if (!account.rowCount) throw new ValidationError('RESOURCE_UNAVAILABLE');
}

export async function replaceToken(client: PoolClient, accountId: string, purpose: TokenPurpose, tokenHash: string) {
  validateHash(tokenHash);
  await lockAccount(client, accountId);
  await client.query('UPDATE one_use_tokens SET superseded_at=clock_timestamp() WHERE account_id=$1 AND purpose=$2 AND consumed_at IS NULL AND superseded_at IS NULL', [accountId, purpose]);
  const result = await client.query<{ id: string; issued_at: Date; expires_at: Date }>(
    `WITH instant AS MATERIALIZED (SELECT clock_timestamp() AS now)
     INSERT INTO one_use_tokens(id,account_id,purpose,token_hash,issued_at,expires_at)
     SELECT $1,$2,$3,$4,now,now + CASE WHEN $3='verify_email' THEN interval '2 hours' ELSE interval '30 minutes' END FROM instant
     RETURNING id,issued_at,expires_at`, [randomUUID(), accountId, purpose, tokenHash]);
  const row = result.rows[0];
  if (!row) throw new Error('No se pudo emitir el token.');
  return { id: row.id, issuedAt: row.issued_at, expiresAt: row.expires_at };
}

export async function consumeToken<T>(client: PoolClient, accountId: string, purpose: TokenPurpose, tokenHash: string, effect: () => Promise<T>): Promise<T> {
  validateHash(tokenHash);
  await lockAccount(client, accountId);
  const consumed = await client.query(
    `UPDATE one_use_tokens SET consumed_at=clock_timestamp()
     WHERE account_id=$1 AND purpose=$2 AND token_hash=$3
     AND consumed_at IS NULL AND superseded_at IS NULL AND expires_at>clock_timestamp()
     RETURNING id`, [accountId, purpose, tokenHash]);
  if (!consumed.rowCount) throw new ValidationError('TOKEN_INVALID');
  return effect();
}
