import { createHash, randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import type { HttpDto } from '../../../../packages/contracts/src/http-dto.js';
import type { Credential } from '../http/access.js';
import type { TokenServices } from '../auth/tokens.service.js';
import { TokenOperationError } from '../auth/tokens.service.js';
import { ValidationError } from '../../../../packages/contracts/src/validation.js';
import type { ErrorCode } from '../../../../packages/contracts/src/http.js';
import { canonicalize } from '../../../../packages/document/src/revision.js';
import { inTransaction } from '../db/transaction.js';
import { runOperation, requestDigest } from '../operations/operation.service.js';
import { purgeAccountResults } from '../operations/purge-results.js';
import { SessionService } from '../auth/session.service.js';
import { DeletionCheckService } from './deletion-check.service.js';
type Session = Extract<Credential, { kind: 'session' }>;
export interface AccountContent {
  // All production content mutations must use the same account lock.
  scope(client: PoolClient, ownerId: string): Promise<{ resources: unknown[]; versions: number; files: number; bytes: number }>;
  // Must persist an idempotent purge request using this transaction. No physical
  // deletion or cloud access here. The durable adapter is supplied by US8.
  requestPurge(client: PoolClient, ownerId: string, requestId: string): Promise<void>;
  isPurged(client: PoolClient, ownerId: string): Promise<boolean>;
}
export class DeletionService {
  constructor(private readonly services: Pick<TokenServices, 'pool' | 'passwords' | 'operationKey' | 'operationKeyVersion'>, private readonly sessions: SessionService, readonly checks: DeletionCheckService, private readonly content: AccountContent) {}
  private async capture(client: PoolClient, accountId: string) {
    const scope = await this.content.scope(client, accountId);
    const scopeRevision = createHash('sha256').update(canonicalize({ accountId, ...scope })).digest('hex');
    return { scopeRevision, ...scope };
  }
  async scope(session: Session, input: HttpDto<'ScopeQuery'>) {
    if (input.kind !== 'account' || input.id !== session.accountId || input.action !== 'delete-account') throw new ValidationError('ACCESS_DENIED');
    return inTransaction(this.services.pool, async client => {
      await this.sessions.authorizeFor(client, session, 'normal');
      const value = await this.capture(client, session.accountId);
      await this.sessions.authorizeFor(client, session, 'normal'); return value;
    });
  }
  private async operation(client: PoolClient, session: Session, type: string, input: { operationId: string }, effect: () => Promise<unknown>) {
    return runOperation(client, { requesterId: session.accountId, operationType: type, operationId: input.operationId }, requestDigest(input, this.services.operationKey, this.services.operationKeyVersion), async () => {
      await client.query('SAVEPOINT deletion_effect');
      try { const data = await effect(); await client.query('RELEASE SAVEPOINT deletion_effect'); return { outcome: 'success', data }; }
      catch (error) {
        if (!(error instanceof ValidationError) || error.code === 'INTERNAL_ERROR') throw error;
        await client.query('ROLLBACK TO SAVEPOINT deletion_effect'); await client.query('RELEASE SAVEPOINT deletion_effect');
        return { outcome: 'failure', data: { code: error.code } };
      }
    });
  }
  async delete(session: Session, input: HttpDto<'DeleteAccount'>) {
    let capability: string | undefined;
    const result = await inTransaction(this.services.pool, async client => {
      await this.sessions.authorizeFor(client, session, 'normal');
      const result = await this.operation(client, session, 'deleteAccount', input, async () => {
        const account = (await client.query<{ password_hash: string }>('SELECT password_hash FROM accounts WHERE id=$1', [session.accountId])).rows[0]!;
        if (!await this.services.passwords.verify(account.password_hash, input.currentPassword)) throw new ValidationError('REAUTHENTICATION_FAILED');
        if ((await this.capture(client, session.accountId)).scopeRevision !== input.scopeRevision) throw new ValidationError('SCOPE_CHANGED');
        await this.sessions.authorizeFor(client, session, 'normal');
        const requestId = randomUUID();
        await client.query(`WITH instant AS MATERIALIZED (SELECT clock_timestamp() AS now)
          INSERT INTO deletion_checks(request_id,account_id,operation_id,state,requested_at,expires_at)
          SELECT $1,$2,$3,'pending',now,now+interval '30 days' FROM instant`, [requestId, session.accountId, input.operationId]);
        capability = await this.checks.issue(client, requestId);
        await client.query("UPDATE accounts SET status='deletion_pending',deletion_deadline=(SELECT expires_at FROM deletion_checks WHERE request_id=$2) WHERE id=$1", [session.accountId, requestId]);
        await client.query('UPDATE sessions SET revoked_at=COALESCE(revoked_at,clock_timestamp()) WHERE account_id=$1', [session.accountId]);
        // Check deadline of the initiating session after revocation, ignoring
        // only the intended state changes performed by this transaction.
        const valid = (await client.query('SELECT id FROM sessions WHERE id=$1 AND expires_at>clock_timestamp()', [session.sessionId])).rowCount;
        if (!valid) throw new ValidationError('SESSION_EXPIRED');
        return { requestId, status: 'deletion_pending' };
      });
      if (result.outcome === 'success' && capability) {
        const data = result.data as { requestId: string };
        // Anchor the 30 days to this operation's exact confirmation instant.
        const dates = (await client.query<{ requested_at: Date; expires_at: Date }>("UPDATE deletion_checks SET requested_at=$2::timestamptz,expires_at=$2::timestamptz+interval '30 days' WHERE request_id=$1 RETURNING requested_at,expires_at", [data.requestId, result.confirmedAt])).rows[0]!;
        await client.query('UPDATE accounts SET deletion_deadline=$2 WHERE id=$1', [session.accountId, dates.expires_at]);
        result.data = { ...data, status: 'deletion_pending', requestedAt: dates.requested_at.toISOString(), expiresAt: dates.expires_at.toISOString() };
        await client.query('UPDATE operation_results SET data=$4::jsonb WHERE requester_id=$1 AND operation_type=$2 AND operation_id=$3', [session.accountId, 'deleteAccount', input.operationId, JSON.stringify(result.data)]);
        if (!(await client.query('SELECT id FROM sessions WHERE id=$1 AND expires_at>clock_timestamp()', [session.sessionId])).rowCount) throw new ValidationError('SESSION_EXPIRED');
      }
      return result;
    });
    if (result.outcome === 'failure') throw new TokenOperationError(input.operationId, result.data as { code: ErrorCode });
    return { result: { operationId: input.operationId, ...result }, capability };
  }
  async info(session: Session) {
    return inTransaction(this.services.pool, async client => {
      await this.sessions.authorizeFor(client, session, 'account_recovery');
      const row = (await client.query<{ requested_at: Date; expires_at: Date; operation_id: string }>("SELECT d.requested_at,a.deletion_deadline AS expires_at,d.operation_id FROM deletion_checks d JOIN accounts a ON a.id=d.account_id WHERE d.account_id=$1 AND d.state='pending'", [session.accountId])).rows[0];
      if (!row) throw new ValidationError('RESOURCE_UNAVAILABLE');
      await this.sessions.authorizeFor(client, session, 'account_recovery');
      return { status: 'deletion_pending', requestedAt: row.requested_at.toISOString(), expiresAt: row.expires_at.toISOString(), operationId: row.operation_id };
    });
  }
  async recover(session: Session, input: HttpDto<'RecoverAccount'>) {
    const result = await inTransaction(this.services.pool, async client => {
      await this.sessions.authorizeFor(client, session, 'account_recovery');
      return this.operation(client, session, 'recoverAccount', input, async () => {
        const row = (await client.query<{ request_id: string; deadline: Date }>("SELECT d.request_id,a.deletion_deadline AS deadline FROM deletion_checks d JOIN accounts a ON a.id=d.account_id WHERE d.account_id=$1 AND d.state='pending' FOR UPDATE OF d", [session.accountId])).rows[0];
        if (!row) throw new ValidationError('RESOURCE_UNAVAILABLE');
        await this.sessions.authorizeFor(client, session, 'account_recovery');
        await client.query("UPDATE accounts SET status='active',deletion_deadline=NULL WHERE id=$1", [session.accountId]);
        await client.query('UPDATE sessions SET revoked_at=COALESCE(revoked_at,clock_timestamp()) WHERE account_id=$1', [session.accountId]);
        const valid = await client.query('SELECT id FROM sessions WHERE id=$1 AND expires_at>clock_timestamp() AND $2::timestamptz>clock_timestamp()', [session.sessionId, row.deadline]);
        if (!valid.rowCount) throw new ValidationError('RETENTION_EXPIRED');
        await this.checks.finish(client, row.request_id, 'cancelled');
        if (!(await client.query('SELECT id FROM sessions WHERE id=$1 AND expires_at>clock_timestamp() AND $2::timestamptz>clock_timestamp()', [session.sessionId, row.deadline])).rowCount) throw new ValidationError('RETENTION_EXPIRED');
        return { loginRequired: true, requestId: row.request_id };
      });
    });
    if (result.outcome === 'failure') throw new TokenOperationError(input.operationId, result.data as { code: ErrorCode });
    return { operationId: input.operationId, ...result };
  }
  async issue(session: Session, input: HttpDto<'Operation'>) {
    let capability: string | undefined;
    const result = await inTransaction(this.services.pool, async client => {
      await this.sessions.authorizeFor(client, session, 'account_recovery');
      const result = await this.operation(client, session, 'deletionCredential', input, async () => {
        const row = (await client.query<{ request_id: string }>("SELECT request_id FROM deletion_checks WHERE account_id=$1 AND state='pending' FOR UPDATE", [session.accountId])).rows[0];
        if (!row) throw new ValidationError('RESOURCE_UNAVAILABLE');
        capability = await this.checks.issue(client, row.request_id);
        return { requestId: row.request_id };
      });
      await this.sessions.authorizeFor(client, session, 'account_recovery'); return result;
    });
    if (result.outcome === 'failure') throw new TokenOperationError(input.operationId, result.data as { code: ErrorCode });
    return { result: { operationId: input.operationId, ...result }, capability };
  }
  async runDue() {
    const accounts = await this.services.pool.query<{ id: string }>("SELECT id FROM accounts WHERE status='deletion_pending' AND deletion_deadline<=clock_timestamp()");
    for (const account of accounts.rows) await inTransaction(this.services.pool, async client => {
      const owner = await client.query("SELECT id FROM accounts WHERE id=$1 AND status='deletion_pending' AND deletion_deadline<=clock_timestamp() FOR UPDATE", [account.id]);
      if (!owner.rowCount) return;
      const row = (await client.query<{ request_id: string }>("SELECT request_id FROM deletion_checks WHERE account_id=$1 AND state='pending' FOR UPDATE", [account.id])).rows[0];
      if (!row) return;
      await client.query("INSERT INTO account_deletion_jobs(request_id,account_id,state) VALUES ($1,$2,'queued') ON CONFLICT DO NOTHING", [row.request_id, account.id]);
      const job = (await client.query<{ state: string }>('SELECT state FROM account_deletion_jobs WHERE request_id=$1 FOR UPDATE', [row.request_id])).rows[0]!;
      if (job.state === 'handed_off') return;
      await this.content.requestPurge(client, account.id, row.request_id);
      await client.query("UPDATE account_deletion_jobs SET state='handed_off' WHERE request_id=$1", [row.request_id]);
    });
    await inTransaction(this.services.pool, client => this.checks.cleanup(client));
  }
  // Internal US8 completion hook. No HTTP endpoint accepts a claim of purge.
  async confirmPurged(client: PoolClient, requestId: string) {
    const job = (await client.query<{ account_id: string; state: string }>('SELECT account_id,state FROM account_deletion_jobs WHERE request_id=$1 FOR UPDATE', [requestId])).rows[0];
    if (!job) {
      const done = await client.query("SELECT request_id FROM deletion_checks WHERE request_id=$1 AND state='deleted'", [requestId]);
      if (done.rowCount) return;
      throw new ValidationError('DEPENDENCIES_BLOCK');
    }
    if (job.state !== 'handed_off' || (await client.query('SELECT id FROM accounts WHERE id=$1', [job.account_id])).rowCount
      || (await client.query(`SELECT operation_id FROM operation_results o
          WHERE (requester_id=$1 OR historical_owner_id=$1)
          AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.id=o.requester_id OR a.id=o.historical_owner_id)
          LIMIT 1`, [job.account_id])).rowCount
      || !await this.content.isPurged(client, job.account_id)) throw new ValidationError('DEPENDENCIES_BLOCK');
    await purgeAccountResults(client,job.account_id);
    await this.checks.finish(client, requestId, 'deleted');
    await client.query('DELETE FROM account_deletion_jobs WHERE request_id=$1', [requestId]);
  }
}
