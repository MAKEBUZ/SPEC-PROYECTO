import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { expect, it } from 'vitest';
import { ProtectedAccountStore } from '../../apps/desktop/src/main/account-store.js';
import type { AccountState } from '../../apps/desktop/src/main/account-session.js';
const value: AccountState = { version: 1, localEnabled: true, active: null, revocations: [], deletionChecks: [], allPending: null };
it('solo persiste bytes cifrados, conserva el último archivo si falla y no repara corrupción', async () => {
  const root = await mkdtemp(join(tmpdir(), 'patron-account-')), key = randomBytes(32); let enabled = true;
  const crypto = {
    isEncryptionAvailable: () => enabled,
    encryptString(text: string) { const iv = randomBytes(12), c = createCipheriv('aes-256-gcm', key, iv); return Buffer.concat([iv, c.update(text), c.final(), c.getAuthTag()]); },
    decryptString(bytes: Buffer) { const d = createDecipheriv('aes-256-gcm', key, bytes.subarray(0,12)); d.setAuthTag(bytes.subarray(-16)); return Buffer.concat([d.update(bytes.subarray(12,-16)), d.final()]).toString('utf8'); },
  };
  try {
    const store = new ProtectedAccountStore(root, crypto, async () => {});
    await store.save(value); const bytes = await readFile(join(root, 'account.bin'));
    expect(bytes.includes(Buffer.from('localEnabled'))).toBe(false); expect(await store.load()).toEqual(value);
    enabled = false; await expect(store.save({ ...value, localEnabled: false })).rejects.toThrow();
    expect(await readFile(join(root, 'account.bin'))).toEqual(bytes);
    enabled = true; await writeFile(join(root, 'account.bin'), Buffer.from('corrupted'));
    await expect(store.load()).rejects.toThrow(); expect(await readFile(join(root, 'account.bin'), 'utf8')).toBe('corrupted');
  } finally { await rm(root, { recursive: true, force: true }); }
});
it('no escribe una alternativa si safeStorage o los permisos fallan', async () => {
  const root = await mkdtemp(join(tmpdir(), 'patron-account-'));
  try {
    const store = new ProtectedAccountStore(root, { isEncryptionAvailable: () => true, encryptString: () => Buffer.from('encrypted-fixture'), decryptString: () => '' }, async () => { throw new Error('ACL unavailable'); });
    await expect(store.save(value)).rejects.toThrow('ACL unavailable');
    await expect(readFile(join(root, 'account.bin'))).rejects.toMatchObject({ code: 'ENOENT' });
  } finally { await rm(root, { recursive: true, force: true }); }
});
