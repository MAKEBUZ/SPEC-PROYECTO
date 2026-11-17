import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll, expect, it } from 'vitest';
import { startAccountHost, PASSWORD } from '../support/account-host.js';
import type { AccountHost } from '../support/account-host.js';
let host: AccountHost;
const origin = 'https://patron.example.invalid';
beforeAll(async () => { host = await startAccountHost(); }, 30000);
afterAll(async () => { await host?.close(); });
class Browser {
  cookies = new Map<string, string>();
  token = '';
  header() { return [...this.cookies].map(([key, value]) => `${key}=${value}`).join('; '); }
  async request(method: string, path: string, body?: unknown, overrides: Record<string,string> = {}) {
    const reply = await host.request(method, path, body, undefined, { Cookie: this.header(), Origin: origin, 'Sec-Fetch-Site': 'same-origin', 'X-Patron-Client': 'browser', ...(this.token ? { 'X-CSRF-Token': this.token } : {}), ...overrides });
    for (const cookie of reply.headers.getSetCookie()) {
      const [pair] = cookie.split(';'), index = pair!.indexOf('=');
      this.cookies.set(pair!.slice(0,index), pair!.slice(index+1));
    }
    const token = reply.headers.get('x-csrf-token'); if (token) this.token = token;
    return reply;
  }
  async init() { const response = await this.request('GET', '/auth/csrf'); expect(response.status).toBe(200); this.token = response.body.token as string; return response; }
  async login(email: string, clientType = 'web') { await this.init(); return this.request('POST', '/sessions', { email, password: PASSWORD, clientType }); }
}
it('login exige Origin y CSRF incluso sin sesión y no emite credenciales ante rechazo', async () => {
  const account = await host.verifiedAccount(), browser = new Browser();
  const body = { email: account.email, password: PASSWORD, clientType: 'web' };
  expect((await browser.request('POST', '/sessions', body)).status).toBe(403);
  await browser.init();
  for (const Origin of ['https://evil.invalid', 'null', '']) {
    const reply = await browser.request('POST', '/sessions', body, { Origin });
    expect(reply.status).toBe(403); expect(reply.headers.getSetCookie()).toHaveLength(0);
  }
  expect((await browser.request('POST', '/sessions', body, { 'X-CSRF-Token': 'invalid' })).status).toBe(403);
});
it.each(['web','mobile'])('%s recibe cookie Host segura HttpOnly y token CSRF ligado a su sesión', async clientType => {
  const account = await host.verifiedAccount(), browser = new Browser();
  const login = await browser.login(account.email, clientType);
  expect(login.status).toBe(200); expect(login.headers.get('authorization')).toBeNull();
  const cookie = login.headers.getSetCookie().find(value => value.startsWith('__Host-patron-session='))!;
  for (const flag of ['Secure', 'HttpOnly', 'SameSite=Lax', 'Path=/']) expect(cookie).toContain(flag);
  expect(cookie).not.toMatch(/Domain=/i); expect(cookie).toContain('Expires=');
  expect(JSON.stringify(login.body)).not.toContain(browser.cookies.get('__Host-patron-session'));
  expect((await browser.request('GET', '/account/profile')).status).toBe(200);
  expect((await browser.request('PATCH', '/account/profile', { operationId: randomUUID(), displayName: 'Desde navegador' })).status).toBe(200);
});
it('token de otra sesión, mezcla cookie/Bearer y orígenes ajenos no permiten mutar', async () => {
  const account = await host.verifiedAccount(), a = new Browser(), b = new Browser();
  await a.login(account.email); await b.login(account.email);
  const body = { operationId: randomUUID(), displayName: 'No guardar' };
  expect((await a.request('PATCH', '/account/profile', body, { 'X-CSRF-Token': b.token })).status).toBe(403);
  expect((await a.request('PATCH', '/account/profile', body, { Authorization: account.session.credential })).status).toBe(403);
  expect((await a.request('PATCH', '/account/profile', body, { 'Sec-Fetch-Site': 'cross-site' })).status).toBe(403);
  expect((await a.request('GET', '/auth/csrf', undefined, { Origin: 'https://evil.invalid' })).status).toBe(403);
  expect((await host.accountRow(account.accountId)).display_name).not.toBe('No guardar');
});
it('logout requiere CSRF, limpia cookies y revoca en servidor; CAD continúa independiente', async () => {
  const account = await host.verifiedAccount(), browser = new Browser(); await browser.login(account.email);
  const saved = browser.header(), token = browser.token;
  expect((await browser.request('DELETE', '/sessions/current', { operationId: randomUUID() }, { 'X-CSRF-Token': '' })).status).toBe(403);
  const reply = await browser.request('DELETE', '/sessions/current', { operationId: randomUUID() });
  expect(reply.status).toBe(200); expect(reply.headers.getSetCookie().every(cookie => cookie.includes('Max-Age=0'))).toBe(true);
  expect((await host.request('GET', '/account/profile', undefined, undefined, { Cookie: saved, Origin: origin, 'X-CSRF-Token': token })).status).toBe(401);
  expect((await host.request('GET', '/account/profile', undefined, account.session)).status).toBe(200);
});
it('cerrar todas limpia cookies, no renueva el vencimiento y revoca también sesiones CAD', async () => {
  const account = await host.verifiedAccount(), browser = new Browser(); const login = await browser.login(account.email);
  const deadline = login.body.expiresAt;
  await browser.init();
  expect((await host.pool.query('SELECT expires_at FROM sessions WHERE id=$1', [login.body.id])).rows[0].expires_at.toISOString()).toBe(deadline);
  const reply = await browser.request('POST', '/sessions/revoke-all', { operationId: randomUUID(), confirmation: true });
  expect(reply.status).toBe(200); expect(reply.headers.getSetCookie().some(cookie => cookie.startsWith('__Host-patron-session=;'))).toBe(true);
  expect((await host.request('GET', '/account/profile', undefined, account.session)).status).toBe(401);
});
it('cookie duplicada, token anterior al login y clientType desktop no eluden la protección', async () => {
  const account = await host.verifiedAccount(), browser = new Browser();
  await browser.init(); const prior = browser.token;
  expect((await browser.request('POST', '/sessions', { email: account.email, password: PASSWORD, clientType: 'desktop' })).status).toBe(403);
  expect((await browser.request('POST', '/sessions', { email: account.email, password: PASSWORD, clientType: 'desktop' }, { Origin: 'https://evil.invalid' })).status).toBe(403);
  expect((await browser.login(account.email)).status).toBe(200);
  const body = { operationId: randomUUID(), displayName: 'No modificar' };
  expect((await browser.request('PATCH', '/account/profile', body, { 'X-CSRF-Token': prior })).status).toBe(403);
  expect((await browser.request('PATCH', '/account/profile', body, { Cookie: browser.header()+'; __Host-patron-session=forged' })).status).toBe(403);
  expect((await host.accountRow(account.accountId)).display_name).not.toBe('No modificar');
});
it('las mutaciones públicas del navegador también requieren CSRF y no habilitan CORS', async () => {
  const browser = new Browser(), email = `${randomUUID()}@example.invalid`;
  const body = { operationId: randomUUID(), email, password: PASSWORD };
  expect((await browser.request('POST', '/accounts', body)).status).toBe(403);
  await browser.init(); const reply = await browser.request('POST', '/accounts', body);
  expect(reply.status).toBe(201); expect(reply.headers.get('access-control-allow-origin')).toBeNull();
  expect((await browser.request('POST', '/password-reset/request', { operationId: randomUUID(), email }, { 'X-CSRF-Token': '' })).status).toBe(403);
});
