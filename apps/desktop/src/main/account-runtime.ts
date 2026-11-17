import { safeStorage, net } from 'electron';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { AccountSession } from './account-session.js';
import { ProtectedAccountStore } from './account-store.js';
import { HttpsAccountRemote } from './account-remote.js';
const execute = promisify(execFile);
export async function protectAccountDirectory(path: string): Promise<void> {
  if (process.platform !== 'win32') throw new Error('Plataforma de almacenamiento no admitida.');
  const system = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32');
  const identity = await execute(join(system, 'whoami.exe'), ['/user','/fo','csv','/nh'], { windowsHide: true });
  const sid = identity.stdout.match(/S-1-5-\d+(?:-\d+)+/)?.[0];
  if (!sid) throw new Error('No se pudo comprobar el usuario Windows.');
  await execute(join(system, 'icacls.exe'), [path, '/inheritance:r', '/grant:r', `*${sid}:(OI)(CI)F`, '*S-1-5-18:(OI)(CI)F'], { windowsHide: true });
}
export const windowsAccountCrypto = {
  isEncryptionAvailable: async () => process.platform === 'win32' && await safeStorage.isAsyncEncryptionAvailable(),
  encryptString: (value: string) => safeStorage.encryptStringAsync(value),
  decryptString: async (value: Buffer) => (await safeStorage.decryptStringAsync(value)).result,
};
export function createAccountSession(userData: string): AccountSession {
  return new AccountSession(new ProtectedAccountStore(join(userData, 'account'), windowsAccountCrypto, protectAccountDirectory), new HttpsAccountRemote(process.env.PATRON_API_ORIGIN, () => net.isOnline()));
}
