import { createHmac, timingSafeEqual } from 'node:crypto';
import type { PoolClient } from 'pg';
import { canonicalize } from '../../../../packages/document/src/revision.js';
import { ValidationError } from '../../../../packages/contracts/src/validation.js';

export interface OperationKey { requesterId: string; operationType: string; operationId: string }
export interface RecordedResult { state: 'pending' | 'resolved'; outcome: 'success' | 'failure' | 'no_change' | null; data: unknown; confirmedAt: string | null }

export function requestDigest(payload: unknown, key: Buffer, keyVersion: string): string {
  if (key.length < 32 || !/^[a-z0-9-]+$/i.test(keyVersion)) throw new Error('Clave HMAC de operación inválida.');
  return keyVersion + ':' + createHmac('sha256', key).update(canonicalize(payload)).digest('hex');
}

// Caller owns the transaction: authorization and business changes must use this
// same client, so rollback also removes the idempotency reservation/result.
export async function runOperation(
  client: PoolClient,
  key: OperationKey,
  digest: string,
  execute: () => Promise<{ outcome: 'success' | 'failure' | 'no_change'; data: unknown }>,
): Promise<RecordedResult> {
  const values = [key.requesterId, key.operationType, key.operationId];
  const inserted = await client.query('INSERT INTO operation_results(requester_id, operation_type, operation_id, request_hash, state) VALUES ($1,$2,$3,$4,\'pending\') ON CONFLICT DO NOTHING RETURNING operation_id', [...values, digest]);
  const selected = await client.query<{ request_hash: string; state: RecordedResult['state']; outcome: RecordedResult['outcome']; data: unknown; confirmed_at: Date | null }>('SELECT request_hash, state, outcome, data, confirmed_at FROM operation_results WHERE requester_id=$1 AND operation_type=$2 AND operation_id=$3 FOR UPDATE', values);
  const row = selected.rows[0];
  if (!row) throw new Error('No se pudo comprobar la operación.');
  const actual = Buffer.from(row.request_hash), expected = Buffer.from(digest);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new ValidationError('IDEMPOTENCY_CONFLICT');
  if (!inserted.rowCount) return { state: row.state, outcome: row.outcome, data: row.data, confirmedAt: row.confirmed_at?.toISOString() ?? null };
  const result = await execute();
  const updated = await client.query<{ confirmed_at: Date }>('UPDATE operation_results SET state=\'resolved\', outcome=$4, data=$5::jsonb, confirmed_at=clock_timestamp() WHERE requester_id=$1 AND operation_type=$2 AND operation_id=$3 RETURNING confirmed_at', [...values, result.outcome, JSON.stringify(result.data)]);
  const confirmation = updated.rows[0];
  if (!confirmation) throw new Error('No se pudo confirmar la operación.');
  return { state: 'resolved', ...result, confirmedAt: confirmation.confirmed_at.toISOString() };
}
