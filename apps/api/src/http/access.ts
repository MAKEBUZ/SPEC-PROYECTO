import { SetMetadata } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { ROUTES } from '../../../../packages/contracts/src/routes.js';
import type { AccessPolicy, RouteName, RouteContract } from '../../../../packages/contracts/src/routes.js';
import type { AccessClass } from '../../../../packages/contracts/src/http.js';
import { DTO } from '../../../../packages/contracts/src/http-dto.js';
import { object, text, uuid, ValidationError } from '../../../../packages/contracts/src/validation.js';

export type Credential =
  | { kind: 'session'; accountId: string; sessionId?: string; accessClass: AccessClass; accountStatus: 'active' | 'pending_verification' | 'deletion_pending'; verified: boolean; expiresAt: number; revoked: boolean }
  | { kind: 'deletion'; requestId: string; credentialId?: string; expiresAt: number | null };
export function authorizeAccess(policy: AccessPolicy, credential: Credential | undefined, now: number, requestId?: string): void {
  if (policy === 'public') return;
  if (!credential) throw new ValidationError('SESSION_REQUIRED');
  if (policy === 'deletion_credential') {
    if (credential.kind !== 'deletion' || credential.requestId !== requestId || (credential.expiresAt !== null && (!Number.isFinite(credential.expiresAt) || credential.expiresAt <= now))) throw new ValidationError('ACCESS_DENIED');
    return;
  }
  if (credential.kind !== 'session') throw new ValidationError('ACCESS_DENIED');
  if (policy === 'own_session') return; // Resolver still verifies the secret of this exact session.
  if (credential.revoked) throw new ValidationError('SESSION_REVOKED');
  if (!Number.isFinite(credential.expiresAt) || credential.expiresAt <= now) throw new ValidationError('SESSION_EXPIRED');
  if (credential.accessClass !== policy) throw new ValidationError('ACCOUNT_LIMITED');
  if (policy === 'normal' && (credential.accountStatus !== 'active' || !credential.verified)) throw new ValidationError('ACCOUNT_LIMITED');
  if (policy === 'verification' && credential.accountStatus !== 'pending_verification') throw new ValidationError('ACCOUNT_LIMITED');
  if (policy === 'account_recovery' && credential.accountStatus !== 'deletion_pending') throw new ValidationError('ACCOUNT_LIMITED');
}

const ROUTE_METADATA = 'patronaje:route';
export const ContractRoute = (name: RouteName) => SetMetadata(ROUTE_METADATA, name);
export type CredentialResolver = (context: ExecutionContext) => Promise<Credential | undefined>;
interface Request { body?: unknown; params?: unknown; query?: unknown; contractCredential?: Credential | undefined; contractInput?: { body?: unknown; query?: unknown }; headers: Record<string, string | string[] | undefined> }

export class ContractGuard implements CanActivate {
  constructor(private readonly resolve: CredentialResolver = async () => undefined) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const key: unknown = Reflect.getMetadata(ROUTE_METADATA, context.getHandler());
    if (typeof key !== 'string' || !Object.hasOwn(ROUTES, key)) throw new ValidationError('ACCESS_DENIED');
    const route: RouteContract = ROUTES[key as RouteName];
    const request = context.switchToHttp().getRequest<Request>();
    const params = object(request.params ?? {});
    for (const match of route.path.matchAll(/\{([^}]+)\}/g)) {
      const field = match[1]!;
      if (field === 'kind') { if (params[field] !== 'project' && params[field] !== 'pattern') throw new ValidationError('INVALID_INPUT'); }
      else uuid(params[field]);
    }
    // Resolver performs server-side lookup/secret verification. Request fields
    // never become trusted credentials. Services must revalidate at commit/send.
    const credential = route.access === 'public' ? undefined : await this.resolve(context);
    authorizeAccess(route.access, credential, Date.now(), typeof params.requestId === 'string' ? params.requestId : undefined);
    const length = request.headers['content-length'];
    if (length !== undefined) {
      text(length);
      if (!/^\d+$/.test(length)) throw new ValidationError('INVALID_INPUT');
      if (BigInt(length) > 100000000n) throw new ValidationError('FILE_TOO_LARGE');
    }
    const input: { body?: unknown; query?: unknown } = {};
    if (route.body) input.body = DTO[route.body].parse(request.body);
    else if (!route.binary && request.body !== undefined && Object.keys(object(request.body)).length) throw new ValidationError('INVALID_INPUT');
    if (route.query) {
      const query = { ...object(request.query ?? {}) };
      // HTTP query strings are text. Only this explicit integer field is decoded.
      if (route.query === 'Pagination' && typeof query.limit === 'string' && /^\d+$/.test(query.limit)) query.limit = Number(query.limit);
      input.query = DTO[route.query].parse(query);
    } else if (Object.keys(object(request.query ?? {})).length) throw new ValidationError('INVALID_INPUT');
    request.contractInput = input;
    request.contractCredential = credential;
    return true;
  }
}
