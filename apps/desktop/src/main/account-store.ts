import { mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { parseAccountState } from './account-session.js';
import type { AccountState, AccountStore } from './account-session.js';
export interface ProtectedStorage { isEncryptionAvailable(): boolean | Promise<boolean>; encryptString(value: string): Buffer | Promise<Buffer>; decryptString(value: Buffer): string | Promise<string> }
export class ProtectedAccountStore implements AccountStore {
  constructor(private readonly directory: string, private readonly crypto: ProtectedStorage, private readonly protectDirectory: (path: string) => Promise<void>) {}
  private async requireEncryption() { if (!await this.crypto.isEncryptionAvailable()) throw new Error('El cifrado del sistema no está disponible.'); }
  async load(): Promise<AccountState | undefined> {
    await this.requireEncryption();
    let bytes: Buffer;
    try { bytes = await readFile(join(this.directory, 'account.bin')); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw new Error('No se pudo leer el almacén protegido.'); }
    try { return parseAccountState(JSON.parse(await this.crypto.decryptString(bytes))); }
    catch { throw new Error('No se pudo abrir el almacén protegido; no se reparó ni eliminó.'); }
  }
  async save(state: AccountState): Promise<void> {
    await this.requireEncryption(); const valid = parseAccountState(state);
    const encrypted = await this.crypto.encryptString(JSON.stringify(valid));
    await mkdir(this.directory, { recursive: true }); await this.protectDirectory(this.directory);
    const temporary = join(this.directory, `${randomUUID()}.tmp`);
    try {
      const file = await open(temporary, 'wx', 0o600);
      try { await file.writeFile(encrypted); await file.sync(); } finally { await file.close(); }
      await rename(temporary, join(this.directory, 'account.bin'));
    } finally { await unlink(temporary).catch(() => undefined); }
  }
}
