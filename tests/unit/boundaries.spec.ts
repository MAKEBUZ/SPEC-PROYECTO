import { afterEach, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Pool, PoolClient } from 'pg';
import { inTransaction, lockAccountAndSession } from '../../apps/api/src/db/transaction.js';
import { requestDigest, runOperation } from '../../apps/api/src/operations/operation.service.js';
import { LocalBlobStore } from '../../apps/api/src/storage/blob-store.js';
import { CaptureMailTransport } from '../../apps/api/src/mail/mail-transport.js';
import { authorizeIpc, CapabilityRegistry } from '../../apps/desktop/src/main/ipc-boundary.js';

const temporary: string[] = [];
afterEach(async () => { for (const path of temporary.splice(0)) await rm(path, { recursive: true, force: true }); });

it('rollback y liberación usan la misma conexión, incluso con fallo de rollback', async () => {
  const calls: string[] = [];
  const release = vi.fn();
  const client = { query: async (sql: string) => { calls.push(sql); if (sql === 'ROLLBACK') throw new Error('connection lost'); }, release } as unknown as PoolClient;
  const pool = { connect: async () => client } as Pick<Pool, 'connect'>;
  const original = new Error('business failure');
  await expect(inTransaction(pool, async (connection) => { expect(connection).toBe(client); throw original; })).rejects.toBe(original);
  expect(calls).toEqual(['BEGIN', 'ROLLBACK']);
  expect(release).toHaveBeenCalledWith(expect.any(Error));
});
it('bloquea cuenta antes que sesión con parámetros', async () => {
  const query = vi.fn().mockResolvedValue({ rows: [] });
  await lockAccountAndSession({ query } as unknown as PoolClient, 'account', 'session');
  expect(query.mock.calls[0]?.[1]).toEqual(['account']);
  expect(query.mock.calls[1]?.[1]).toEqual(['session', 'account']);
});
it('reserva idempotente reutilizada no ejecuta efectos; contenido distinto se rechaza', async () => {
  const key = { requesterId: 'account', operationType: 'test', operationId: 'operation' };
  const payload = { password: 'never log this' };
  const digest = requestDigest(payload, Buffer.alloc(32, 7), 'v1');
  expect(digest).not.toContain('password');
  const query = vi.fn().mockResolvedValueOnce({ rowCount: 0 }).mockResolvedValueOnce({ rows: [{ request_hash: digest, state: 'resolved', outcome: 'success', data: { id: 1 }, confirmed_at: new Date(0) }] });
  const execute = vi.fn();
  expect(await runOperation({ query } as unknown as PoolClient, key, digest, execute)).toMatchObject({ state: 'resolved', data: { id: 1 } });
  expect(execute).not.toHaveBeenCalled();
  query.mockResolvedValueOnce({ rowCount: 0 }).mockResolvedValueOnce({ rows: [{ request_hash: digest }] });
  await expect(runOperation({ query } as unknown as PoolClient, key, digest + 'x', execute)).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
});
it('capacidades IPC no se transfieren entre ventanas ni subframes', () => {
  const caps = new CapabilityRegistry();
  const handle = caps.issue(1, 'document', '/private');
  const request = { method: 'document.trash', requestId: 'r1', documentHandle: handle, confirmed: true, confirmationId: '80000000-0000-4000-8000-000000000001' };
  expect(() => authorizeIpc(request, 2, 'file:///app', 'file:///app', true, caps)).toThrow();
  expect(() => authorizeIpc(request, 1, 'file:///app', 'file:///app', false, caps)).toThrow();
  expect(() => authorizeIpc(request, 1, 'https://evil', 'file:///app', true, caps)).toThrow();
  expect(authorizeIpc(request, 1, 'file:///app', 'file:///app', true, caps)).toMatchObject(request);
  caps.revokeOwner(1);
  expect(() => authorizeIpc(request, 1, 'file:///app', 'file:///app', true, caps)).toThrow();
});
it('blobs locales no permiten traversal ni sustitución de bytes existentes', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'patron-foundation-')); temporary.push(directory);
  const store = new LocalBlobStore(directory), key = 'a'.repeat(64);
  await expect(store.put('../secret', Buffer.from('x'))).rejects.toThrow();
  await store.put(key, Buffer.from('first'));
  await expect(store.put(key, Buffer.from('second'))).rejects.toThrow();
  expect(Buffer.from(await store.get(key)).toString()).toBe('first');
});
it('el correo de ensayo se captura sin transferencia', async () => {
  const mail = new CaptureMailTransport();
  await mail.send({ recipient: 'test@example.invalid', subject: 'Verificar', text: 'synthetic' });
  expect(mail.messages).toHaveLength(1);
});
it.each(['action','commit','rollback'] as const)('T087 records rollback only with positive pre-commit evidence: %s',async point=>{
 const proof=vi.fn(async()=>{}),client={query:async(sql:string)=>{if(sql==='COMMIT'&&point==='commit'||sql==='ROLLBACK'&&point==='rollback')throw Error(point);},release:vi.fn()} as unknown as PoolClient;
 await expect(inTransaction({connect:async()=>client},async()=>{if(point!=='commit')throw Error('action');},proof)).rejects.toThrow();
 expect(proof).toHaveBeenCalledTimes(point==='action'?1:0);
});
