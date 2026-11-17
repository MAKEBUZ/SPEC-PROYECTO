import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type {ServerResponse} from 'node:http';
import type {MaintenanceGate} from '../storage/maintenance-gate.js';
import { Catch, HttpException, Module } from '@nestjs/common';
import type { ArgumentsHost, CanActivate, ExceptionFilter, ExecutionContext, INestApplication } from '@nestjs/common';
import { NestFactory, ModuleRef } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Type, DynamicModule } from '@nestjs/common';
import { TokenOperationError } from '../auth/tokens.service.js';
import { PasswordPolicyError } from '../auth/password.service.js';
import { HTTP_ERRORS, errorResponse } from '../../../../packages/contracts/src/http.js';
import type { ErrorCode } from '../../../../packages/contracts/src/http.js';
import { ValidationError } from '../../../../packages/contracts/src/validation.js';
import { parseStrictJson } from '../../../../packages/document/src/json.js';
import { ContractGuard } from './access.js';
import type { CredentialResolver } from './access.js';
import { MAX_FILE_BYTES } from './transport.js';

interface Reply { status(code: number): Reply; setHeader(name: string, value: string): void; json(body: unknown): void }

@Catch()
export class SafeExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const traceId = randomUUID();
    const transportCodes: Readonly<Record<number, ErrorCode>> = {
      400: 'INVALID_INPUT', 401: 'SESSION_REQUIRED', 403: 'ACCESS_DENIED',
      404: 'RESOURCE_UNAVAILABLE', 413: 'FILE_TOO_LARGE',
    };
    const parserType = exception instanceof Error && 'type' in exception ? exception.type : undefined;
    const candidate = exception instanceof ValidationError ? exception.code
      : exception instanceof HttpException ? transportCodes[exception.getStatus()] ?? 'INTERNAL_ERROR'
        : parserType === 'entity.too.large' ? 'FILE_TOO_LARGE'
          : parserType === 'entity.parse.failed' || parserType === 'entity.verify.failed' ? 'INVALID_INPUT'
        : 'INTERNAL_ERROR';
    const code: ErrorCode = Object.hasOwn(HTTP_ERRORS, candidate) ? candidate as ErrorCode : 'INTERNAL_ERROR';
    const response = host.switchToHttp().getResponse<Reply>();
    response.setHeader('Cache-Control', 'no-store');
    // No exception messages, request bodies or SQL enter responses/logs.
    console.error(JSON.stringify({ traceId, code }));
    const detail = exception instanceof TokenOperationError
      ? { operationId: exception.operationId, ...(exception.failure.fieldErrors ? { fieldErrors: exception.failure.fieldErrors } : {}),...(code==='QUOTA_EXCEEDED'&&exception.failure.quota?{quota:exception.failure.quota}:{}) }
      : exception instanceof PasswordPolicyError ? { fieldErrors: exception.fieldErrors } : {};
    response.status(HTTP_ERRORS[code]).json({ ...errorResponse(code, traceId), ...detail });
  }
}

export class DefaultDenyGuard implements CanActivate {
  // Session services supply a server-side resolver later. Client headers alone
  // must never populate an authorization context or grant a resource.
  constructor(private readonly authorize: (context: ExecutionContext) => Promise<boolean> = async () => false) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!await this.authorize(context)) throw new ValidationError('SESSION_REQUIRED');
    return true;
  }
}

@Module({})
export class FoundationModule {}

export async function createLocalApi(module: Type<unknown> | DynamicModule = FoundationModule, resolver?: CredentialResolver, shutdownHooks=true): Promise<INestApplication> {
  const app = await NestFactory.create<NestExpressApplication>(module, { logger: ['error', 'warn'], bodyParser: false });
  app.setGlobalPrefix('v1');
  let maintenance:MaintenanceGate|undefined;
  try{maintenance=app.get(ModuleRef).get<MaintenanceGate>('PATRON_MAINTENANCE',{strict:false});}catch{/* Foundation-only API has no writers. */}
  if(maintenance){const gate=maintenance;app.use((_request:IncomingMessage,response:ServerResponse&Reply,next:()=>void)=>{
   void gate.run(()=>new Promise<void>(done=>{response.once('finish',done);response.once('close',done);next();})).catch(()=>{
    if(!response.headersSent){response.setHeader('Cache-Control','no-store');response.status(HTTP_ERRORS.OPERATION_PENDING).json(errorResponse('OPERATION_PENDING',randomUUID()));}
   });
  });}
  app.use((_request: unknown, response: Reply, next: () => void) => { response.setHeader('Cache-Control', 'no-store'); next(); });
  app.use((request: IncomingMessage & { body?: unknown }, response: Reply, next: (error?: unknown) => void) => {
    const reject = (code: 'INVALID_INPUT' | 'FILE_TOO_LARGE') => {
      response.setHeader('Connection', 'close');
      response.status(HTTP_ERRORS[code]).json(errorResponse(code, randomUUID()));
    };
    const declared = request.headers['content-length'];
    if (declared !== undefined && (!/^\d+$/.test(declared) || BigInt(declared) > BigInt(MAX_FILE_BYTES))) {
      reject(/^\d+$/.test(declared) ? 'FILE_TOO_LARGE' : 'INVALID_INPUT'); return;
    }
    const mediaType = request.headers['content-type']?.split(';')[0]?.trim().toLowerCase();
    // Editable uploads are raw declared file bytes even when their MIME is JSON.
    // The authenticated upload controller counts and validates them before staging.
    if(request.method==='PUT'&&/^\/v1\/publications\/[a-f0-9-]+\/files\/[a-f0-9-]+$/.test(request.url??'')){next();return;}
    if (mediaType !== 'application/json') { next(); return; }
    const chunks: Buffer[] = []; let size = 0; let failed = false;
    request.on('data', (chunk: Buffer) => {
      if (failed) return;
      size += chunk.length;
      if (size > MAX_FILE_BYTES) { failed = true; chunks.length = 0; reject('FILE_TOO_LARGE'); }
      else chunks.push(chunk);
    });
    request.on('end', () => {
      if (failed) return;
      try { request.body = parseStrictJson(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))); next(); }
      catch { reject('INVALID_INPUT'); }
    });
    request.on('error', () => { if (!failed) { failed = true; reject('INVALID_INPUT'); } });
  });
  let configuredResolver = resolver;
  const moduleRef = app.get(ModuleRef);
  if (!configuredResolver) {
    try { configuredResolver = moduleRef.get<CredentialResolver>('PATRON_CREDENTIAL_RESOLVER', { strict: false }); }
    catch { /* Foundation-only composition remains default deny. */ }
  }
  let csrf: CanActivate | undefined;
  try { csrf = moduleRef.get<CanActivate>('PATRON_CSRF_GUARD', { strict: false }); } catch { /* No browser auth in foundation-only modules. */ }
  if (csrf) app.useGlobalGuards(csrf);
  app.useGlobalGuards(new ContractGuard(configuredResolver));
  app.useGlobalFilters(new SafeExceptionFilter());
  if(shutdownHooks)app.enableShutdownHooks();
  // Intentionally does not listen or open connections on import.
  return app;
}
