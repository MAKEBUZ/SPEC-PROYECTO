// Test-only composition: real renderer, IPC, account service and Windows store.
// Loopback HTTP is confined to this harness; production still requires HTTPS.
import { app, net } from 'electron';
import { resolve, join } from 'node:path';
import { existsSync } from 'node:fs';
import { AccountSession } from '../../apps/desktop/src/main/account-session.js';
import { ProtectedAccountStore } from '../../apps/desktop/src/main/account-store.js';
import { windowsAccountCrypto, protectAccountDirectory } from '../../apps/desktop/src/main/account-runtime.js';
import { createDesktopWindow } from '../../apps/desktop/src/main/index.js';
const base = process.env.PATRON_E2E_API;
if (!base || !/^http:\/\/127\.0\.0\.1:\d+\/v1$/.test(base)) throw new Error('API de ensayo no local.');
const directory = resolve('.local', 'account-e2e', process.env.PATRON_E2E_RUN ?? '');
app.setPath('userData', directory);
const account = new AccountSession(new ProtectedAccountStore(join(directory,'protected'), windowsAccountCrypto, protectAccountDirectory), {
  online: () => net.isOnline() && !existsSync(join(directory,'offline')),
  async request(method,path,body,credential) {
    const response = await fetch(base+path, { method, headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(credential ? { Authorization: credential } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, body: await response.json(),
      ...(response.headers.get('authorization') ? { credential: response.headers.get('authorization')! } : {}),
      ...(response.headers.get('x-deletion-credential') ? { deletionCredential: response.headers.get('x-deletion-credential')! } : {}),
    };
  },
});
void createDesktopWindow(false,account).catch(() => app.exit(1));
app.on('window-all-closed', () => app.quit());
