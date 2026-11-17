import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type { PoolClient } from 'pg';
import type { HttpDto } from '../../../../packages/contracts/src/http-dto.js';
import type { AccessClass, ErrorCode } from '../../../../packages/contracts/src/http.js';
import { ValidationError } from '../../../../packages/contracts/src/validation.js';
import type { Credential, CredentialResolver } from '../http/access.js';
import { authorizeAccess } from '../http/access.js';
import { inTransaction, lockAccountAndSession } from '../db/transaction.js';
import { requestDigest, runOperation } from '../operations/operation.service.js';
import { PasswordPolicyError } from './password.service.js';
import { TokenOperationError } from './tokens.service.js';
import type { TokenServices } from './tokens.service.js';
import { sessionAuthorization } from './csrf.guard.js';

type SessionCredential = Extract<Credential, { kind: 'session' }>;
interface Row {
  id: string; account_id: string; token_hash: string; access_class: AccessClass;
  started_at: Date; expires_at: Date; revoked_at: Date | null;
  status: 'active' | 'pending_verification' | 'deletion_pending'; verified_at: Date | null;
  now: Date; within_recovery: boolean;
}
const hash = (value: string) => createHash('sha256').update(value).digest();
export class SessionService {
  private readonly key: Buffer;
  constructor(private readonly services: Pick<TokenServices, 'pool' | 'passwords' | 'operationKey' | 'operationKeyVersion'>) {
    this.key = Buffer.from(services.operationKey);
    requestDigest({}, this.key, services.operationKeyVersion);
  }
  async login(input: HttpDto<'Login'>) {
    return inTransaction(this.services.pool, async client => {
      const account = (await client.query<{ id: string; password_hash: string }>('SELECT id,password_hash FROM accounts WHERE email=$1 FOR UPDATE', [input.email.trim().toLowerCase()])).rows[0];
      if (!account || !await this.services.passwords.verify(account.password_hash, input.password)) throw new ValidationError('REAUTHENTICATION_FAILED');
      const state = (await client.query<{ status: Row['status']; verified_at: Date | null; valid: boolean }>('SELECT status,verified_at,(deletion_deadline IS NULL OR deletion_deadline>clock_timestamp()) AS valid FROM accounts WHERE id=$1', [account.id])).rows[0]!;
      if (!state.valid) throw new ValidationError('REAUTHENTICATION_FAILED');
      const accessClass: AccessClass = state.status === 'deletion_pending' ? 'account_recovery'
        : state.status === 'pending_verification' ? 'verification' : 'normal';
      if (accessClass === 'normal' && !state.verified_at) throw new ValidationError('REAUTHENTICATION_FAILED');
      const id = randomUUID(), secret = randomBytes(32).toString('base64url');
      const row = (await client.query<{ started_at: Date; expires_at: Date }>(`WITH instant AS MATERIALIZED (SELECT clock_timestamp() AS now)
        INSERT INTO sessions(id,account_id,token_hash,access_class,started_at,expires_at)
        SELECT $1,$2,$3,$4,now,now+interval '7 days' FROM instant RETURNING started_at,expires_at`, [id, account.id, hash(secret).toString('hex'), accessClass])).rows[0]!;
      const final = await this.row(client, id);
      if (!final?.within_recovery || final.expires_at <= final.now) throw new ValidationError('REAUTHENTICATION_FAILED');
      return { credential: `Bearer ${id}.${secret}`, view: { id, accountId: account.id, accessClass, startedAt: row.started_at.toISOString(), expiresAt: row.expires_at.toISOString() } };
    });
  }
  private credential(row: Row): SessionCredential {
    return { kind: 'session', accountId: row.account_id, sessionId: row.id, accessClass: row.access_class, accountStatus: row.status, verified: row.verified_at !== null, expiresAt: row.expires_at.getTime(), revoked: row.revoked_at !== null };
  }
  private async row(client: Pick<PoolClient, 'query'>, id: string): Promise<Row | undefined> {
    return (await client.query<Row>(`SELECT s.*,a.status,a.verified_at,clock_timestamp() AS now,
      (a.deletion_deadline IS NULL OR a.deletion_deadline>clock_timestamp()) AS within_recovery
      FROM sessions s JOIN accounts a ON a.id=s.account_id WHERE s.id=$1`, [id])).rows[0];
  }
  readonly resolve: CredentialResolver = async context => {
    const authorization: unknown = sessionAuthorization(context.switchToHttp().getRequest());
    if (typeof authorization !== 'string') return undefined;
    const parts = /^Bearer ([a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12})\.([\w-]{43})$/i.exec(authorization);
    if (!parts) return undefined;
    const row = await this.row(this.services.pool, parts[1]!);
    const expected = row ? Buffer.from(row.token_hash, 'hex') : Buffer.alloc(32);
    const matches = expected.length === 32 && timingSafeEqual(expected, hash(parts[2]!));
    if (!row || !matches) return undefined;
    return this.credential(row);
  };
  private async check(client: PoolClient, credential: SessionCredential, ownOnly = false): Promise<Row> {
    if (!credential.sessionId) throw new ValidationError('SESSION_REQUIRED');
    await lockAccountAndSession(client, credential.accountId, credential.sessionId);
    const row = await this.row(client, credential.sessionId);
    if (!row || row.account_id !== credential.accountId) throw new ValidationError('SESSION_REQUIRED');
    if (!ownOnly) {
      authorizeAccess('normal', this.credential(row), row.now.getTime());
      if (!row.within_recovery) throw new ValidationError('ACCOUNT_LIMITED');
    }
    return row;
  }
  async authorizeFor(client: PoolClient, credential: SessionCredential, policy: 'normal' | 'account_recovery') {
    if (!credential.sessionId) throw new ValidationError('SESSION_REQUIRED');
    await lockAccountAndSession(client, credential.accountId, credential.sessionId);
    const row = await this.row(client, credential.sessionId);
    if (!row || row.account_id !== credential.accountId) throw new ValidationError('SESSION_REQUIRED');
    authorizeAccess(policy, this.credential(row), row.now.getTime());
    if (!row.within_recovery) throw new ValidationError('RETENTION_EXPIRED');
    return row;
  }
  async profile(credential: SessionCredential) {
    return inTransaction(this.services.pool, async client => {
      await this.check(client, credential);
      const row = (await client.query<{ id: string; email: string; display_name: string | null; verified_at: Date | null; status: Row['status']; used_bytes: string; reserved_bytes: string }>('SELECT id,email,display_name,verified_at,status,used_bytes,reserved_bytes FROM accounts WHERE id=$1', [credential.accountId])).rows[0]!;
      await this.check(client, credential);
      return { id: row.id, email: row.email, ...(row.display_name === null ? {} : { displayName: row.display_name }), verifiedAt: row.verified_at?.toISOString() ?? null, status: row.status, usedBytes: Number(row.used_bytes), reservedBytes: Number(row.reserved_bytes), limitBytes: 2000000000 };
    });
  }
  private async mutate(credential: SessionCredential, type: string, input: { operationId: string }, effect: (client: PoolClient) => Promise<unknown>, ownOnly = false, revokesCurrent = false) {
    const result = await inTransaction(this.services.pool, async client => {
      await this.check(client, credential, ownOnly);
      return runOperation(client, { requesterId: credential.accountId, operationType: type, operationId: input.operationId }, requestDigest(ownOnly ? { ...input, sessionId: credential.sessionId } : input, this.key, this.services.operationKeyVersion), async () => {
        await client.query('SAVEPOINT session_effect');
        try {
          const data = await effect(client);
          // Revocation of our own session is the intended effect, but expiry and
          // account access still need checking at confirmation of revoke-all.
          if (revokesCurrent) {
            const row = await this.row(client, credential.sessionId!);
            if (!row) throw new ValidationError('SESSION_REQUIRED');
            authorizeAccess('normal', { ...this.credential(row), revoked: false }, row.now.getTime());
          } else await this.check(client, credential, ownOnly);
          await client.query('RELEASE SAVEPOINT session_effect');
          return { outcome: 'success', data };
        } catch (error) {
          if (!(error instanceof ValidationError) || error.code === 'INTERNAL_ERROR') throw error;
          await client.query('ROLLBACK TO SAVEPOINT session_effect');
          await client.query('RELEASE SAVEPOINT session_effect');
          return { outcome: 'failure', data: { code: error.code, ...(error instanceof PasswordPolicyError ? { fieldErrors: error.fieldErrors } : {}) } };
        }
      });
    });
    if (result.outcome === 'failure') throw new TokenOperationError(input.operationId, result.data as { code: ErrorCode });
    return { operationId: input.operationId, ...result };
  }
  logout(credential: SessionCredential, input: HttpDto<'Operation'>) {
    return this.mutate(credential, 'logout', input, async client => {
      await client.query('UPDATE sessions SET revoked_at=COALESCE(revoked_at,clock_timestamp()) WHERE id=$1 AND account_id=$2', [credential.sessionId, credential.accountId]);
      return { loggedOut: true };
    }, true);
  }
  revokeAll(credential: SessionCredential, input: HttpDto<'RevokeAll'>) {
    return this.mutate(credential, 'revokeAll', input, async client => {
      await client.query('UPDATE sessions SET revoked_at=COALESCE(revoked_at,clock_timestamp()) WHERE account_id=$1', [credential.accountId]);
      return { revokedAll: true, loginRequired: true };
    }, false, true);
  }
  updateProfile(credential: SessionCredential, input: HttpDto<'UpdateProfile'>) {
    return this.mutate(credential, 'updateProfile', input, async client => {
      await client.query('UPDATE accounts SET display_name=$2 WHERE id=$1', [credential.accountId, input.displayName]);
      return { displayName: input.displayName };
    });
  }
  changePassword(credential: SessionCredential, input: HttpDto<'ChangePassword'>) {
    return this.mutate(credential, 'password', input, async client => {
      const row = (await client.query<{ password_hash: string }>('SELECT password_hash FROM accounts WHERE id=$1', [credential.accountId])).rows[0]!;
      if (!await this.services.passwords.verify(row.password_hash, input.currentPassword)) throw new ValidationError('REAUTHENTICATION_FAILED');
      const encoded = await this.services.passwords.hashNew(input.newPassword);
      await this.check(client, credential);
      await client.query('UPDATE accounts SET password_hash=$2 WHERE id=$1', [credential.accountId, encoded]);
      return { passwordChanged: true };
    });
  }
}
