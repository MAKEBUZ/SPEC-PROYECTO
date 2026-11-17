import { expect, it, vi } from 'vitest';
import { HttpsAccountRemote } from '../../apps/desktop/src/main/account-remote.js';
it('solo acepta origen HTTPS configurado, rutas fijas y no sigue redirecciones ni cookies', async () => {
  expect(() => new HttpsAccountRemote('http://example.invalid', () => true)).toThrow();
  const fetcher = vi.fn(async () => Response.json({}));
  const remote = new HttpsAccountRemote('https://example.invalid', () => true, fetcher as typeof fetch);
  await expect(remote.request('GET', 'https://evil.invalid')).rejects.toThrow();
  expect(fetcher).not.toHaveBeenCalled();
  await remote.request('DELETE', '/sessions/current', { operationId: 'fixture' }, 'Bearer fixture');
  expect(fetcher).toHaveBeenCalledWith('https://example.invalid/v1/sessions/current', expect.objectContaining({ redirect: 'error', credentials: 'omit', cache: 'no-store', headers: expect.objectContaining({ Authorization: 'Bearer fixture' }) }));
});
