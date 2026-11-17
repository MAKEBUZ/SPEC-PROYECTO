import { app, safeStorage } from 'electron';
import { mkdir, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { ProtectedAccountStore } from '../../apps/desktop/src/main/account-store.js';
import { protectAccountDirectory, windowsAccountCrypto } from '../../apps/desktop/src/main/account-runtime.js';
import assert from 'node:assert/strict';
import { createDesktopWindow } from '../../apps/desktop/src/main/index.js';
async function run(): Promise<void> {
try {
  const root = resolve('.local', `desktop-account-smoke-${randomUUID()}`);
  await mkdir(root, { recursive: true }); app.setPath('userData', root);
  delete process.env.PATRON_API_ORIGIN; // No remote endpoint in this native smoke test.
  const window = await createDesktopWindow(false);
  const markup = await window.webContents.executeJavaScript('document.body.innerText');
  assert.match(markup, /Tu cuenta/); assert.match(markup, /Iniciar sesión/);
  const state = await window.webContents.executeJavaScript('({require:typeof require, process:typeof process, api:typeof window.patron.request})');
  assert.deepEqual(state, { require: 'undefined', process: 'undefined', api: 'function' });
  const result = await window.webContents.executeJavaScript('window.patron.request({requestId:"smoke",method:"document.open"})');
  assert.equal(result.status, 'error');
  assert.equal(result.requestId, 'smoke');
  // File handlers now exist; an unverified installation must fail at the CAD
  // activation gate before showing a native file dialog.
  assert.equal(result.error.code, 'SESSION_REQUIRED');
  const account = await window.webContents.executeJavaScript('window.patron.request({requestId:"account-smoke",method:"account.status"})');
  assert.equal(account.status, 'success'); assert.equal(account.data.localEnabled, false);
  assert.equal(JSON.stringify(account).includes('credential'), false);
  assert.equal(await safeStorage.isAsyncEncryptionAvailable(), true);
  const store = new ProtectedAccountStore(join(root, 'protected'), windowsAccountCrypto, protectAccountDirectory);
  const secret = `Bearer ${randomUUID()}.${'s'.repeat(43)}`;
  const stored = { version: 1 as const, localEnabled: true, active: null, revocations: [{ operationId: randomUUID(), credential: secret }], deletionChecks: [{ requestId: randomUUID(), credential: `Bearer ${randomUUID()}.${'d'.repeat(43)}` }], allPending: null };
  await store.save(stored); assert.deepEqual(await store.load(), stored);
  assert.equal((await readFile(join(root, 'protected', 'account.bin'))).includes(Buffer.from(secret)), false);
  console.log('Windows safeStorage + private ACL + account IPC PASS');
  console.log('Electron isolation PASS', process.versions.electron, process.versions.node);
  window.destroy();
  app.exit(0);
} catch (error) { console.error(error); app.exit(1); }

}
void run();
