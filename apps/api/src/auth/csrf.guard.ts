import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { ValidationError } from '../../../../packages/contracts/src/validation.js';

export const SESSION_COOKIE = '__Host-patron-session';
const CSRF_COOKIE = '__Host-patron-csrf';
export interface BrowserRequest { method: string; headers: Record<string, string | string[] | undefined>; body?: unknown }
export interface CookieReply { setHeader(name: string, value: string | string[]): void }
export function readCookie(request: BrowserRequest, name: string): string | undefined {
  const raw = request.headers.cookie;
  if (raw === undefined) return undefined;
  if (typeof raw !== 'string') throw new ValidationError('ACCESS_DENIED');
  const matches = raw.split(';').map(value => value.trim()).filter(value => value.startsWith(name+'='));
  if (matches.length > 1) throw new ValidationError('ACCESS_DENIED');
  return matches[0]?.slice(name.length+1) || undefined;
}
export function sessionAuthorization(request: BrowserRequest): string | undefined {
  const cookie = readCookie(request, SESSION_COOKIE), bearer = request.headers.authorization;
  if (cookie && bearer !== undefined) throw new ValidationError('ACCESS_DENIED');
  return cookie ? `Bearer ${cookie}` : typeof bearer === 'string' ? bearer : undefined;
}
export class CsrfGuard implements CanActivate {
  private readonly key: Buffer;
  private readonly origin: string | undefined;
  constructor(key: Buffer, origin?: string) {
    if (key.length < 32) throw new Error('Clave CSRF inválida.');
    this.key = Buffer.from(key);
    if (origin !== undefined) {
      const url = new URL(origin);
      if (url.protocol !== 'https:' || url.origin !== origin || url.username || url.password) throw new Error('Origen CSRF inválido.');
      this.origin = origin;
    }
  }
  private signature(nonce: string, session?: string) {
    return createHmac('sha256', this.key).update(JSON.stringify(['patron-csrf-v1', session ?? 'pre-login', nonce])).digest('base64url');
  }
  private valid(token: unknown, session?: string): token is string {
    if (typeof token !== 'string' || !/^[\w-]{43}\.[\w-]{43}$/.test(token)) return false;
    const [nonce, signature] = token.split('.');
    return timingSafeEqual(Buffer.from(signature!), Buffer.from(this.signature(nonce!, session)));
  }
  private token(session?: string) { const nonce = randomBytes(32).toString('base64url'); return `${nonce}.${this.signature(nonce, session)}`; }
  private cookie(name: string, value: string, expires?: string) {
    return `${name}=${value}; Path=/; Secure; HttpOnly; SameSite=Lax${expires ? `; Expires=${new Date(expires).toUTCString()}` : ''}`;
  }
  private checkOrigin(request: BrowserRequest, required: boolean) {
    const origin = request.headers.origin, site = request.headers['sec-fetch-site'];
    if (!this.origin || (required && origin !== this.origin) || (origin !== undefined && origin !== this.origin)
      || (site !== undefined && site !== 'same-origin' && site !== 'none')) throw new ValidationError('ACCESS_DENIED');
  }
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<BrowserRequest>();
    const session = readCookie(request, SESSION_COOKIE), csrf = readCookie(request, CSRF_COOKIE);
    sessionAuthorization(request); // reject mixed authentication transports
    const body = request.body;
    const clientType = body && typeof body === 'object' && 'clientType' in body ? body.clientType : undefined;
    const browser = session !== undefined || csrf !== undefined || request.headers.origin !== undefined
      || request.headers['sec-fetch-site'] !== undefined || request.headers['x-patron-client'] === 'browser' || clientType === 'web' || clientType === 'mobile';
    if (!browser) return true; // Native CAD uses explicit Bearer, never ambient cookies.
    if (clientType === 'desktop') throw new ValidationError('ACCESS_DENIED');
    const mutation = !['GET', 'HEAD', 'OPTIONS'].includes(request.method);
    this.checkOrigin(request, mutation);
    if (mutation) {
      const header = request.headers['x-csrf-token'];
      if (!this.valid(csrf, session) || typeof header !== 'string' || header !== csrf) throw new ValidationError('ACCESS_DENIED');
    }
    return true;
  }
  bootstrap(request: BrowserRequest, response: CookieReply) {
    this.checkOrigin(request, false);
    // A custom header prevents a form/image from obtaining or overwriting the
    // pre-login token. No CORS grant is installed for foreign origins.
    if (request.headers['x-patron-client'] !== 'browser') throw new ValidationError('ACCESS_DENIED');
    const session = readCookie(request, SESSION_COOKIE), existing = readCookie(request, CSRF_COOKIE);
    const token = this.valid(existing, session) ? existing : this.token(session);
    response.setHeader('Set-Cookie', this.cookie(CSRF_COOKIE, token));
    return { token };
  }
  login(response: CookieReply, credential: string, expiresAt: string) {
    if (!this.origin) throw new ValidationError('ACCESS_DENIED');
    const session = credential.slice('Bearer '.length), token = this.token(session);
    response.setHeader('Set-Cookie', [this.cookie(SESSION_COOKIE, session, expiresAt), this.cookie(CSRF_COOKIE, token, expiresAt)]);
    response.setHeader('X-CSRF-Token', token);
  }
  clear(request: BrowserRequest, response: CookieReply) {
    if (readCookie(request, SESSION_COOKIE)) response.setHeader('Set-Cookie', [SESSION_COOKIE, CSRF_COOKIE].map(name => this.cookie(name, '')+'; Max-Age=0'));
  }
}
