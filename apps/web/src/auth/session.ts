'use client';
import {clientContextId} from '../../../../packages/account-ui/src/context-id.js';

// Only the CSRF token lives in JS memory. Session cookies are managed by the
// browser; never copy authentication credentials to storage or a service worker.
export class BrowserSession {
  private csrf: string | undefined;
  constructor(private readonly fetcher: typeof fetch = (...args) => fetch(...args)) {}
  clearCsrf() { this.csrf = undefined; }
  async prepare(){
    if(this.csrf)return;
    const reply=await this.fetcher('/v1/auth/csrf',{signal:AbortSignal.timeout(15000),credentials:'same-origin',cache:'no-store',headers:{'X-Patron-Client':'browser'},redirect:'error'});
    if(!reply.ok)throw Error('MUTATION_NOT_SENT');const body:unknown=await reply.json();
    if(!body||typeof body!=='object'||!('token'in body)||typeof body.token!=='string')throw Error('MUTATION_NOT_SENT');this.csrf=body.token;
  }
  async request(path: string, init: RequestInit = {}): Promise<Response> {
    if (!path.startsWith('/v1/') || path.includes('\\') || path.includes('#') || path.split('?')[0]!.split('/').includes('..')) throw new Error('Ruta de cuenta inválida.');
    const method = (init.method ?? 'GET').toUpperCase();
    const mutation = !['GET', 'HEAD'].includes(method);
    if (mutation) await this.prepare();
    const headers = new Headers(init.headers);
    headers.delete('Authorization'); headers.set('X-Patron-Client', 'browser');
    if (mutation) headers.set('X-CSRF-Token', this.csrf!);
    const reply = await this.fetcher(path, { ...init, signal: init.signal ?? AbortSignal.timeout(15000), method, headers, credentials: 'same-origin', cache: 'no-store', redirect: 'error' });
    const token = reply.headers.get('x-csrf-token'); if (token) this.csrf = token;
    if (reply.status === 401 || reply.status === 403 || (reply.ok && (path === '/v1/sessions/current' || path === '/v1/sessions/revoke-all'))) this.csrf = undefined;
    if(reply.ok&&['/v1/sessions','/v1/sessions/current','/v1/sessions/revoke-all','/v1/account/deletion','/v1/account/recovery'].includes(path)&&typeof window!=='undefined'&&typeof BroadcastChannel!=='undefined'){
      const channel=new BroadcastChannel('patron-account-state');channel.postMessage({kind:'changed',source:clientContextId()});channel.close();
    }
    // No automatic mutation replay: the caller retains operationId and resolves
    // an uncertain result before deciding whether another operation is allowed.
    return reply;
  }
}
