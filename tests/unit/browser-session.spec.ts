import { expect, it, vi } from 'vitest';
import { BrowserSession } from '../../apps/web/src/auth/session.js';

it('prepara CSRF, usa solo mismo origen/no-store y conserva la rotación en memoria', async () => {
  const calls: { path: unknown; init: RequestInit | undefined }[] = [];
  const fetcher = vi.fn(async (path: unknown, init?: RequestInit) => {
    calls.push({ path, init });
    if (path === '/v1/auth/csrf') return Response.json({ token: 'pre-login' });
    if (path === '/v1/sessions') return Response.json({}, { headers: { 'X-CSRF-Token': 'session-token' } });
    return Response.json({});
  });
  const browser = new BrowserSession(fetcher as typeof fetch);
  await browser.request('/v1/sessions', { method: 'POST', headers: { Authorization: 'must-not-send' } });
  await browser.request('/v1/account/profile', { method: 'PATCH' });
  expect(calls).toHaveLength(3);
  for (const call of calls) {
    expect(call.init).toMatchObject({ credentials: 'same-origin', cache: 'no-store', redirect: 'error' });
    expect(new Headers(call.init?.headers).has('Authorization')).toBe(false);
  }
  expect(new Headers(calls[1]!.init?.headers).get('x-csrf-token')).toBe('pre-login');
  expect(new Headers(calls[2]!.init?.headers).get('x-csrf-token')).toBe('session-token');
});
it('no reenvía mutaciones rechazadas ni tras fallo de conexión', async () => {
  let mutations = 0;
  const fetcher = vi.fn(async (path: unknown) => {
    if (path === '/v1/auth/csrf') return Response.json({ token: 'csrf' });
    mutations++; if (mutations === 1) return Response.json({}, { status: 403 });
    throw new Error('offline');
  });
  const browser = new BrowserSession(fetcher as typeof fetch);
  expect((await browser.request('/v1/account/profile', { method: 'PATCH' })).status).toBe(403);
  expect(mutations).toBe(1);
  await expect(browser.request('/v1/account/profile', { method: 'PATCH' })).rejects.toThrow('offline');
  expect(mutations).toBe(2);
  expect(fetcher).toHaveBeenCalledTimes(4);
});
it('rechaza URLs externas y no envía nada si falla la preparación CSRF', async () => {
  const fetcher = vi.fn(async () => Response.json({}, { status: 403 }));
  const browser = new BrowserSession(fetcher as typeof fetch);
  await expect(browser.request('https://evil.invalid/v1/sessions')).rejects.toThrow();
  expect(fetcher).not.toHaveBeenCalled();
  await expect(browser.request('/v1/sessions', { method: 'POST' })).rejects.toThrow();
  expect(fetcher).toHaveBeenCalledTimes(1);
});
