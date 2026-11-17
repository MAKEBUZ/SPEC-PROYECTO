import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import type { HttpDto } from '../../../../packages/contracts/src/http-dto.js';
import { ValidationError } from '../../../../packages/contracts/src/validation.js';
import type { ErrorCode } from '../../../../packages/contracts/src/http.js';
import { replaceToken, consumeToken } from '../db/identity.js';
import type { TokenPurpose } from '../db/identity.js';
import { inTransaction } from '../db/transaction.js';
import { requestDigest, runOperation } from '../operations/operation.service.js';
import type { RecordedResult } from '../operations/operation.service.js';
import { PasswordService, PasswordPolicyError } from './password.service.js';
import type { TokenDeliveryQueue } from './token-delivery.js';

export interface TokenServices {
  pool: Pool;
  passwords: PasswordService;
  delivery: TokenDeliveryQueue;
  operationKey: Buffer;
  operationKeyVersion: string;
}
type Account = { id: string; email: string; status: string; within_recovery: boolean };
type Failure = { code: ErrorCode; fieldErrors?: { field: string; code: string }[]; quota?: { usedBytes:number;reservedBytes:number;requestedBytes:number;limitBytes:number } };
export class TokenOperationError extends ValidationError {
  constructor(readonly operationId: string, readonly failure: Failure) { super(failure.code); }
}
const hash = (secret: string) => createHash('sha256').update(secret).digest('hex');
function emailAddress(value: string): string {
  const email = value.trim().toLowerCase();
  if (!email.isWellFormed() || !/^[^\s@\u0000-\u001f\u007f]+@[^\s@\u0000-\u001f\u007f]+\.[^\s@\u0000-\u001f\u007f]+$/u.test(email)) throw new ValidationError('INVALID_INPUT');
  return email;
}

export class TokensService {
  private readonly key: Buffer;
  constructor(private readonly dependencies: TokenServices) {
    this.key = Buffer.from(dependencies.operationKey);
    requestDigest({}, this.key, dependencies.operationKeyVersion); // fail closed on invalid configuration
  }
  private digest(input: unknown) { return requestDigest(input, this.key, this.dependencies.operationKeyVersion); }
  private async account(client: PoolClient, id: string): Promise<Account> {
    const result = await client.query<Account>("SELECT id,email,status,(deletion_deadline IS NULL OR deletion_deadline>clock_timestamp()) AS within_recovery FROM accounts WHERE id=$1 FOR UPDATE", [id]);
    if (!result.rows[0]) throw new ValidationError('TOKEN_INVALID');
    return result.rows[0];
  }
  private async issue(client: PoolClient, account: { id: string; email: string }, purpose: TokenPurpose) {
    const secret = randomBytes(32).toString('base64url');
    const token = await replaceToken(client, account.id, purpose, hash(secret));
    await this.dependencies.delivery.enqueue(client, { tokenId: token.id, accountId: account.id, recipient: account.email, purpose, secret, issuedAt: token.issuedAt, expiresAt: token.expiresAt });
  }
  private async operation(client: PoolClient, actorId: string, type: string, input: { operationId: string }, execute: () => Promise<unknown>) {
    return runOperation(client, { requesterId: actorId, operationType: type, operationId: input.operationId }, this.digest(input), async () => {
      // Only controlled domain failures become terminal results. Infrastructure
      // failures roll back the result, token and all effects together.
      await client.query('SAVEPOINT token_effect');
      try {
        const data = await execute();
        await client.query('RELEASE SAVEPOINT token_effect');
        return { outcome: 'success', data };
      }
      catch (error) {
        if (error instanceof ValidationError && error.code !== 'INTERNAL_ERROR') {
          await client.query('ROLLBACK TO SAVEPOINT token_effect');
          await client.query('RELEASE SAVEPOINT token_effect');
          const data: Failure = { code: error.code as ErrorCode };
          if (error instanceof PasswordPolicyError) data.fieldErrors = error.fieldErrors;
          return { outcome: 'failure', data };
        }
        throw error;
      }
    });
  }
  private response(operationId: string, result: RecordedResult) {
    if (result.outcome === 'failure') throw new TokenOperationError(operationId, result.data as Failure);
    return { operationId, ...result };
  }
  async register(input: HttpDto<'Register'>) {
    const email = emailAddress(input.email);
    const result = await inTransaction(this.dependencies.pool, async client => {
      // Serialize creation even before an account row exists. Different emails
      // remain independent; the UNIQUE constraint is the final invariant.
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [email]);
      const existing = await client.query<{ id: string }>('SELECT id FROM accounts WHERE email=$1 FOR UPDATE', [email]);
      const accountId = existing.rows[0]?.id ?? randomUUID();
      const passwordHash = existing.rowCount ? undefined : await this.dependencies.passwords.hashNew(input.password);
      const result = await this.operation(client, accountId, 'register', input, async () => {
        if (existing.rowCount) throw new ValidationError('INVALID_INPUT');
        await client.query("INSERT INTO accounts(id,email,password_hash,display_name,status) VALUES ($1,$2,$3,$4,'pending_verification')", [accountId, email, passwordHash, input.displayName ?? null]);
        await this.issue(client, { id: accountId, email }, 'verify_email');
        return { accountId, status: 'pending_verification' };
      });
      // A failed creation has no identity under which to retain a result.
      if (!existing.rowCount && result.outcome === 'failure') throw new TokenOperationError(input.operationId, result.data as Failure);
      return result;
    });
    return this.response(input.operationId, result);
  }
  private async verificationSession(client: PoolClient, accountId: string, sessionId: string) {
    const account = await this.account(client, accountId);
    const selected = await client.query<{ revoked_at: Date | null; expired: boolean; access_class: string }>('SELECT revoked_at,expires_at<=clock_timestamp() AS expired,access_class FROM sessions WHERE id=$1 AND account_id=$2 FOR UPDATE', [sessionId, accountId]);
    const session = selected.rows[0];
    if (!session) throw new ValidationError('SESSION_REQUIRED');
    if (session.revoked_at) throw new ValidationError('SESSION_REVOKED');
    if (session.expired) throw new ValidationError('SESSION_EXPIRED');
    if (session.access_class !== 'verification' || account.status !== 'pending_verification') throw new ValidationError('ACCOUNT_LIMITED');
    return account;
  }
  async resend(input: HttpDto<'Operation'>, accountId: string, sessionId: string) {
    const result = await inTransaction(this.dependencies.pool, async client => {
      const account = await this.verificationSession(client, accountId, sessionId);
      const result = await this.operation(client, accountId, 'verificationRequest', input, async () => {
        await this.issue(client, account, 'verify_email');
        return { verificationRequested: true };
      });
      // Expiry may pass during queue persistence. This check is outside the
      // terminal-result wrapper so it rolls back issuance as well.
      await this.verificationSession(client, accountId, sessionId);
      return result;
    });
    return this.response(input.operationId, result);
  }
  async requestReset(input: HttpDto<'ResetRequest'>) {
    const email = emailAddress(input.email);
    await inTransaction(this.dependencies.pool, async client => {
      const found = await client.query<{ id: string }>('SELECT id FROM accounts WHERE email=$1 FOR UPDATE', [email]);
      if (!found.rows[0]) return;
      const account = await this.account(client, found.rows[0].id);
      if (!account.within_recovery) return;
      try {
        await this.operation(client, account.id, 'resetRequest', input, async () => {
          await this.issue(client, account, 'reset_password');
          return { requested: true };
        });
      } catch (error) {
        // A public reset request must not reveal account existence through a
        // changed-body replay. The conflicting request performs no mutation.
        if (!(error instanceof ValidationError) || error.code !== 'IDEMPOTENCY_CONFLICT') throw error;
      }
    });
    return { operationId: input.operationId, state: 'pending' as const };
  }
  async confirmVerification(input: HttpDto<'VerifyEmail'>) { return this.confirm(input, 'verify_email'); }
  async confirmReset(input: HttpDto<'ResetConfirm'>) { return this.confirm(input, 'reset_password'); }
  private async validateToken(client: PoolClient, accountId: string, purpose: TokenPurpose, tokenHash: string) {
    const row = (await client.query<{ expired: boolean; consumed_at: Date | null; superseded_at: Date | null }>('SELECT expires_at<=clock_timestamp() AS expired,consumed_at,superseded_at FROM one_use_tokens WHERE account_id=$1 AND purpose=$2 AND token_hash=$3', [accountId, purpose, tokenHash])).rows[0];
    if (!row || row.consumed_at || row.superseded_at) throw new ValidationError('TOKEN_INVALID');
    if (row.expired) throw new ValidationError('TOKEN_EXPIRED');
    const account = await this.account(client, accountId);
    if (!account.within_recovery) throw new ValidationError('RETENTION_EXPIRED');
    if (purpose === 'verify_email' && account.status !== 'pending_verification') throw new ValidationError('TOKEN_INVALID');
  }
  private async confirm(input: HttpDto<'VerifyEmail'> | HttpDto<'ResetConfirm'>, purpose: TokenPurpose) {
    if (!/^[\w-]{43}$/.test(input.token)) throw new ValidationError('TOKEN_INVALID');
    const tokenHash = hash(input.token);
    const result = await inTransaction(this.dependencies.pool, async client => {
      const token = (await client.query<{ account_id: string }>('SELECT account_id FROM one_use_tokens WHERE purpose=$1 AND token_hash=$2', [purpose, tokenHash])).rows[0];
      if (!token) throw new ValidationError('TOKEN_INVALID');
      await this.account(client, token.account_id);
      return this.operation(client, token.account_id, purpose === 'verify_email' ? 'verificationConfirm' : 'resetConfirm', input, async () => {
        await this.validateToken(client, token.account_id, purpose, tokenHash);
        const passwordHash = 'newPassword' in input ? await this.dependencies.passwords.hashNew(input.newPassword) : undefined;
        // Argon2/corpus I/O can cross a deadline. Recheck before any mutation.
        await this.validateToken(client, token.account_id, purpose, tokenHash);
        return consumeToken(client, token.account_id, purpose, tokenHash, async () => {
          if (purpose === 'verify_email') {
            await client.query("UPDATE accounts SET verified_at=clock_timestamp(),status='active' WHERE id=$1", [token.account_id]);
            await this.checkFinalWindow(client, token.account_id, tokenHash);
            return { verified: true, loginRequired: true };
          }
          await client.query('UPDATE accounts SET password_hash=$2 WHERE id=$1', [token.account_id, passwordHash]);
          await client.query('UPDATE sessions SET revoked_at=COALESCE(revoked_at,clock_timestamp()) WHERE account_id=$1', [token.account_id]);
          await this.checkFinalWindow(client, token.account_id, tokenHash);
          return { passwordReset: true, loginRequired: true };
        });
      });
    });
    return this.response(input.operationId, result);
  }
  private async checkFinalWindow(client: PoolClient, accountId: string, tokenHash: string) {
    const row = (await client.query<{ token_live: boolean; account_live: boolean }>(`SELECT t.expires_at>clock_timestamp() AS token_live,
      (a.deletion_deadline IS NULL OR a.deletion_deadline>clock_timestamp()) AS account_live
      FROM one_use_tokens t JOIN accounts a ON a.id=t.account_id WHERE a.id=$1 AND t.token_hash=$2`, [accountId, tokenHash])).rows[0];
    if (!row) throw new ValidationError('TOKEN_INVALID');
    if (!row.account_live) throw new ValidationError('RETENTION_EXPIRED');
    if (!row.token_live) throw new ValidationError('TOKEN_EXPIRED');
  }
}
