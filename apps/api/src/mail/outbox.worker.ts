import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import type { TokenDelivery, TokenDeliveryQueue } from '../auth/token-delivery.js';
import { inTransaction } from '../db/transaction.js';
import type { MailTransport } from './mail-transport.js';

type Keys = ReadonlyMap<string, Buffer>;
function keyFor(keys: Keys, id: string): Buffer {
  const key = keys.get(id);
  if (!key || key.length !== 32) throw new Error('Clave de outbox no disponible.');
  return key;
}
function copyKeys(keys: Keys): Keys { return new Map([...keys].map(([id, key]) => [id, Buffer.from(key)])); }
function aad(accountId: string, tokenId: string, keyId: string) { return Buffer.from(JSON.stringify(['account-token-v1', accountId, tokenId, keyId])); }

export class OutboxQueue implements TokenDeliveryQueue {
  private readonly keys: Keys;
  constructor(private readonly keyId: string, keys: Keys) {
    this.keys = copyKeys(keys); keyFor(this.keys, keyId);
  }
  async enqueue(client: PoolClient, delivery: TokenDelivery): Promise<void> {
    const nonce = randomBytes(12), cipher = createCipheriv('aes-256-gcm', keyFor(this.keys, this.keyId), nonce);
    cipher.setAAD(aad(delivery.accountId, delivery.tokenId, this.keyId));
    const payload = Buffer.concat([cipher.update(JSON.stringify({ recipient: delivery.recipient, secret: delivery.secret }), 'utf8'), cipher.final()]);
    // Same transaction as token issuance, no transport access. The unique token
    // key also deduplicates retries after an uncertain database response.
    await client.query(`INSERT INTO outbox_jobs(id,kind,deduplication_key,account_id,token_id,state,key_id,payload,nonce,auth_tag)
      VALUES ($1,'account_token',$2,$3,$4,'pending',$5,$6,$7,$8) ON CONFLICT (deduplication_key) DO NOTHING`,
    [randomUUID(), `account-token:${delivery.tokenId}`, delivery.accountId, delivery.tokenId, this.keyId, payload, nonce, cipher.getAuthTag()]);
  }
}
interface Job { id: string; account_id: string; token_id: string; key_id: string; payload: Buffer; nonce: Buffer; auth_tag: Buffer; attempts: number; due: boolean }
export class OutboxWorker {
  private readonly keys: Keys;
  private readonly origin: string;
  constructor(private readonly pool: Pool, keys: Keys, private readonly transport: MailTransport, origin: string) {
    this.keys = copyKeys(keys);
    const url = new URL(origin);
    if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('Origen HTTPS de correo inválido.');
    this.origin = url.origin;
  }
  async dispatchPending(): Promise<void> {
    // Bounded batch; caller schedules another pass. Include invalid/expired jobs
    // even during backoff so their secrets can be removed promptly.
    const candidates = await this.pool.query<{ id: string; account_id: string }>(`SELECT j.id,j.account_id FROM outbox_jobs j
      JOIN one_use_tokens t ON t.id=j.token_id JOIN accounts a ON a.id=j.account_id
      WHERE j.state='pending' AND (j.next_attempt_at<=clock_timestamp() OR t.expires_at<=clock_timestamp()
      OR t.consumed_at IS NOT NULL OR t.superseded_at IS NOT NULL OR a.deletion_deadline<=clock_timestamp())
      ORDER BY j.next_attempt_at,j.id LIMIT 100`);
    for (const candidate of candidates.rows) {
      await inTransaction(this.pool, async client => {
        // All token replacement/consumption uses the same account lock. Hold it
        // until transport finishes so a replaced token is never newly sent.
        const account = await client.query('SELECT id FROM accounts WHERE id=$1 FOR UPDATE SKIP LOCKED', [candidate.account_id]);
        if (!account.rowCount) return;
        const selected = await client.query<Job>("SELECT *,next_attempt_at<=clock_timestamp() AS due FROM outbox_jobs WHERE id=$1 AND state='pending' FOR UPDATE SKIP LOCKED", [candidate.id]);
        const job = selected.rows[0]; if (!job) return;
        const token = (await client.query<{ purpose: string; token_hash: string; valid: boolean }>(`SELECT t.purpose,t.token_hash,
          (t.consumed_at IS NULL AND t.superseded_at IS NULL AND t.expires_at>clock_timestamp()
          AND (a.deletion_deadline IS NULL OR a.deletion_deadline>clock_timestamp())) AS valid
          FROM one_use_tokens t JOIN accounts a ON a.id=t.account_id WHERE t.id=$1 AND t.account_id=$2`, [job.token_id, job.account_id])).rows[0];
        if (!token?.valid) { await this.complete(client, job.id, 'invalidated'); return; }
        if (!job.due) return;
        try {
          const decipher = createDecipheriv('aes-256-gcm', keyFor(this.keys, job.key_id), job.nonce);
          decipher.setAAD(aad(job.account_id, job.token_id, job.key_id)); decipher.setAuthTag(job.auth_tag);
          const message: unknown = JSON.parse(Buffer.concat([decipher.update(job.payload), decipher.final()]).toString('utf8'));
          if (!message || typeof message !== 'object' || !('recipient' in message) || typeof message.recipient !== 'string'
            || !('secret' in message) || typeof message.secret !== 'string'
            || createHash('sha256').update(message.secret).digest('hex') !== token.token_hash) throw new Error('Payload de correo inválido.');
          const verify = token.purpose === 'verify_email';
          const link = new URL(verify ? '/account/verify-email' : '/account/reset-password', this.origin);
          link.searchParams.set('token', message.secret);
          await this.transport.send({ recipient: message.recipient, subject: verify ? 'Verifica tu correo' : 'Restablece tu contraseña', text: `${verify ? 'Confirma tu correo' : 'Establece una contraseña nueva'} abriendo este enlace y confirmando la acción:\n${link.href}` });
        } catch {
          // Do not persist/log provider exceptions: they may contain recipients,
          // URLs or secrets. Backoff does not extend token validity.
          const delay = Math.min(120, 5 * 2 ** Math.min(job.attempts, 5));
          await client.query("UPDATE outbox_jobs SET attempts=attempts+1,next_attempt_at=clock_timestamp()+($2*interval '1 second') WHERE id=$1", [job.id, delay]);
          return;
        }
        await client.query('UPDATE outbox_jobs SET attempts=attempts+1 WHERE id=$1', [job.id]);
        await this.complete(client, job.id, 'delivered');
      });
    }
  }
  private async complete(client: PoolClient, id: string, state: 'delivered' | 'invalidated') {
    await client.query('UPDATE outbox_jobs SET state=$2,key_id=NULL,payload=NULL,nonce=NULL,auth_tag=NULL,completed_at=clock_timestamp() WHERE id=$1', [id, state]);
  }
}
