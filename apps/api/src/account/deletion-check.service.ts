import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import type { CredentialResolver, Credential } from '../http/access.js';
import { readCookie } from '../auth/csrf.guard.js';
import { ValidationError } from '../../../../packages/contracts/src/validation.js';
export const DELETION_COOKIE = '__Secure-deletion-status';
export class DeletionCheckService {
  constructor(private readonly pool: Pool) {}
  async issue(client: PoolClient, requestId: string) {
    const secret = randomBytes(32).toString('base64url'), id = randomUUID();
    await client.query('INSERT INTO deletion_check_credentials(id,request_id,secret_hash) VALUES ($1,$2,$3)', [id, requestId, createHash('sha256').update(secret).digest('hex')]);
    return `Bearer ${id}.${secret}`;
  }
  readonly resolve: CredentialResolver = async context => {
    const request = context.switchToHttp().getRequest();
    const cookie = readCookie(request, DELETION_COOKIE), header: unknown = request.headers.authorization;
    if (cookie && header) throw new ValidationError('ACCESS_DENIED');
    const raw = cookie ? `Bearer ${cookie}` : header;
    if (typeof raw !== 'string') return undefined;
    const match = /^Bearer ([a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12})\.([\w-]{43})$/i.exec(raw);
    if (!match) return undefined;
    const row = (await this.pool.query<{ request_id: string; secret_hash: string; check_expires_at: Date | null }>('SELECT c.request_id,c.secret_hash,d.check_expires_at FROM deletion_check_credentials c JOIN deletion_checks d ON d.request_id=c.request_id WHERE c.id=$1', [match[1]])).rows[0];
    const verifier = row ? Buffer.from(row.secret_hash, 'hex') : Buffer.alloc(32);
    const valid = verifier.length === 32 && timingSafeEqual(verifier, createHash('sha256').update(match[2]!).digest());
    if (!row || !valid) return undefined;
    return { kind: 'deletion', credentialId: match[1]!, requestId: row.request_id, expiresAt: row.check_expires_at?.getTime() ?? null };
  };
  async status(credential: Extract<Credential, { kind: 'deletion' }>, requestId: string) {
    if (!credential.credentialId || credential.requestId !== requestId) throw new ValidationError('ACCESS_DENIED');
    const row = (await this.pool.query<{ state: 'pending' | 'cancelled' | 'deleted'; confirmed_at: Date | null; check_expires_at: Date | null }>(`SELECT d.state,d.confirmed_at,d.check_expires_at FROM deletion_checks d
      JOIN deletion_check_credentials c ON c.request_id=d.request_id WHERE d.request_id=$1 AND c.id=$2
      AND (d.check_expires_at IS NULL OR d.check_expires_at>clock_timestamp())`, [requestId, credential.credentialId])).rows[0];
    if (!row) throw new ValidationError('RESOURCE_UNAVAILABLE');
    return row.state === 'pending' ? { requestId, state: row.state }
      : { requestId, state: row.state, confirmedAt: row.confirmed_at!.toISOString(), checkExpiresAt: row.check_expires_at!.toISOString() };
  }
  async finish(client: PoolClient, requestId: string, state: 'cancelled' | 'deleted') {
    await client.query(`WITH instant AS MATERIALIZED (SELECT clock_timestamp() AS now)
      UPDATE deletion_checks SET state=$2,account_id=NULL,operation_id=NULL,requested_at=NULL,expires_at=NULL,
      confirmed_at=now,check_expires_at=now+interval '90 days' FROM instant WHERE request_id=$1 AND state='pending'`, [requestId, state]);
  }
  async cleanup(client: PoolClient) {
    const expired = await client.query<{ request_id: string }>("SELECT request_id FROM deletion_checks WHERE check_expires_at<=clock_timestamp() FOR UPDATE");
    const ids = expired.rows.map(row => row.request_id);
    // Freeze this batch: another check may expire between the two deletes.
    await client.query('DELETE FROM deletion_check_credentials WHERE request_id=ANY($1::uuid[])', [ids]);
    await client.query('DELETE FROM deletion_checks WHERE request_id=ANY($1::uuid[])', [ids]);
  }
}
