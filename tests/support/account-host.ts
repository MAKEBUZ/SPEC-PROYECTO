import { Global, Module } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { resolve } from 'node:path';
import { Pool } from 'pg';
import { expect } from 'vitest';
import { createLocalApi } from '../../apps/api/src/http/bootstrap.js';
import { AuthModule } from '../../apps/api/src/auth/auth.module.js';
import { PasswordService } from '../../apps/api/src/auth/password.service.js';
import { PasswordCorpus } from '../../apps/api/src/auth/password-index.js';
import { inTransaction } from '../../apps/api/src/db/transaction.js';
import type { PoolClient } from 'pg';
import { migrate } from '../../apps/api/src/db/migrate.js';
import { CaptureMailTransport } from '../../apps/api/src/mail/mail-transport.js';
import { LocalBlobStore } from '../../apps/api/src/storage/blob-store.js';
import { pathToFileURL } from 'node:url';
import { PublicationJobs } from '../../apps/api/src/publications/publication-jobs.js';
import { CommitService } from '../../apps/api/src/publications/commit.service.js';
import { DownloadService } from '../../apps/api/src/files/download.controller.js';
import type {PurgeJournal} from '../../apps/api/src/trash/purge.worker.js';
import {PurgeJobs} from '../../apps/api/src/trash/purge.service.js';
import {AccountPurgeContent,AccountPurgeJobs} from '../../apps/api/src/account/account-purge.worker.js';

export const PASSWORD = 'Patron-Ensayo-42!Árbol';
export const NEW_PASSWORD = 'Otra-Clave-83!Ñandú';
export const DAY = 86400000;
export interface TestContent { id: string; ownerId: string; state: 'active' | 'trashed'; expiresAt: string | null; payload: string }
// Storage double only. It does not decide permissions, retention or recovery;
// those transitions must be performed by the real account services.
export class ContentRepositoryFixture {
  private readonly records = new Map<string, TestContent>();
  readonly purgeRequests: { ownerId: string; operationId: string }[] = [];
  async list(ownerId: string): Promise<TestContent[]> { return structuredClone([...this.records.values()].filter(row => row.ownerId === ownerId)); }
  async put(row: TestContent): Promise<void> { this.records.set(row.id, structuredClone(row)); }
  async remove(id: string): Promise<void> { this.records.delete(id); }
  snapshot(): TestContent[] { return structuredClone([...this.records.values()]); }
  async requestPurge(ownerId: string, operationId: string): Promise<void> { this.purgeRequests.push({ ownerId, operationId }); }
}
export interface ApiReply { status: number; body: Record<string, unknown>; headers: Headers }
export interface Session { credential: string; view: { id: string; accountId: string; accessClass: string; startedAt: string; expiresAt: string } }

export class AccountHost {
  private readonly corpus = new PasswordCorpus();
  private app!: INestApplication;
  private base!: string;
  get testBaseUrl() { return this.base; }
  get downloads() { return this.app.get(DownloadService,{strict:false}); }
  readonly blobs: LocalBlobStore;
  async finishPublications() {
    // Schemas share the production-wide worker lock. A skipped dispatch is not
    // completion: wait for this schema's persisted queue, without bypassing it.
    const deadline=performance.now()+20000;
    do {
      await this.app.get(PublicationJobs,{strict:false}).run();
      const pending=await this.pool.query("SELECT 1 FROM publications WHERE state IN ('validating','validated') LIMIT 1");
      if(!pending.rowCount)return;
      await new Promise(resolve=>setTimeout(resolve,25));
    }while(performance.now()<deadline);
    throw new Error('La cola local de publicaciones no terminó dentro del plazo de prueba.');
  }
  async queuePublication(session:Session,id:string,input:{operationId:string;manifestHash:string}) {
    return this.app.get(CommitService,{strict:false}).request({kind:'session',accountId:session.view.accountId,sessionId:session.view.id,accessClass:'normal',accountStatus:'active',verified:true,expiresAt:Date.parse(session.view.expiresAt),revoked:false},id,input);
  }
  readonly mail = new CaptureMailTransport();
  readonly content = new ContentRepositoryFixture();
  constructor(readonly pool: Pool, private readonly schema?: string,private readonly suppressionLog?:PurgeJournal,private readonly durableContent=false) {
    this.blobs=new LocalBlobStore(resolve('.local','publication-tests',schema??randomUUID()));
  }
  async start(): Promise<void> {
    await migrate(this.pool, resolve('apps/api/src/db/migrations'));
    await this.corpus.reload('.local/password-index', JSON.parse(await readFile('tools/assets/password-index.json', 'utf8')));
    const renderAssets={wasm:await readFile('node_modules/@resvg/resvg-wasm/index_bg.wasm'),font:await readFile('.local/assets/NotoSans-Regular.ttf')};
    const auth = AuthModule.withOutbox({ pool: this.pool, renderAssets,artifactRunner:pathToFileURL(resolve('dist/apps/api/src/publications/artifact-runner.js')),blobStore:this.blobs,...this.suppressionLog?{suppressionLog:this.suppressionLog}:{}, passwords: new PasswordService(this.corpus), operationKey: randomBytes(32), operationKeyVersion: 'test-v1', outboxKeyId: 'test-v1', outboxKeys: new Map([['test-v1', randomBytes(32)]]), mailTransport: this.mail, publicOrigin: 'https://patron.example.invalid', accountContent: {
      scope: async (_client, ownerId) => ({ resources: (await this.content.list(ownerId)).sort((a,b) => a.id.localeCompare(b.id)).map(row => ({ id: row.id, kind: 'pattern', state: row.state, expiresAt: row.expiresAt, revision: createHash('sha256').update(row.payload).digest('hex') })), versions: 0, files: 0, bytes: 0 }),
      requestPurge: async (_client, ownerId, requestId) => this.content.requestPurge(ownerId, requestId),
      isPurged: async (_client, ownerId) => (await this.content.list(ownerId)).length === 0,
    },...this.durableContent?{accountContent:new AccountPurgeContent()}:{} });
    const pool = this.pool, mail = this.mail, content = this.content;
    @Global()
    @Module({ providers: [
      { provide: 'PATRON_DATABASE', useValue: pool },
      { provide: 'PATRON_MAIL_TRANSPORT', useValue: mail },
      { provide: 'PATRON_CONTENT_REPOSITORY', useValue: content },
    ], exports: ['PATRON_DATABASE', 'PATRON_MAIL_TRANSPORT', 'PATRON_CONTENT_REPOSITORY'] })
    class Dependencies {}
    @Module({ imports: [Dependencies, auth] })
    class TestHostModule {}
    this.app = await createLocalApi(TestHostModule);
    await this.app.listen(0, '127.0.0.1');
    this.base = `http://127.0.0.1:${(this.app.getHttpServer().address() as AddressInfo).port}/v1`;
  }
  async close(): Promise<void> {
    await this.app?.close(); await this.corpus.close();
    try {
      if (this.schema) {
        if (!/^account_test_[a-f0-9]{32}$/.test(this.schema)) throw new Error('Esquema de ensayo no autorizado.');
        await this.pool.query(`DROP SCHEMA IF EXISTS ${this.schema} CASCADE`);
      }
    } finally { await this.pool.end(); }
  }
  async request(method: string, path: string, body?: unknown, session?: Session, extraHeaders: Record<string,string> = {}): Promise<ApiReply> {
    const response = await fetch(this.base + path, { method, signal: AbortSignal.timeout(10000), headers: {
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(session ? { Authorization: session.credential } : {}),
      ...extraHeaders,
    }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, body: await response.json() as Record<string, unknown>, headers: response.headers };
  }
  async register(email = `${randomUUID()}@example.invalid`, password = PASSWORD) {
    const response = await this.request('POST', '/accounts', { operationId: randomUUID(), email, password });
    expect(response.status, 'POST /accounts debe existir y registrar, no devolver 404').toBe(201);
    const data = terminal(response);
    expect(data.accountId).toEqual(expect.any(String));
    return { email, password, accountId: data.accountId as string };
  }
  async uploadFile(path:string,bytes:Buffer,session:Session,headers:Record<string,string>){
    return fetch(this.base+path,{method:'PUT',headers:{Authorization:session.credential,...headers},body:Uint8Array.from(bytes),signal:AbortSignal.timeout(10000)});
  }
  async login(email: string, password = PASSWORD, clientType = 'desktop'): Promise<Session> {
    const reply = await this.request('POST', '/sessions', { email, password, clientType });
    expect(reply.status, 'POST /sessions debe autenticar contra el servicio real').toBe(200);
    const credential = reply.headers.get('authorization');
    expect(credential, 'El secreto CAD se entrega solo en la respuesta de inicio de sesión').toMatch(/^Bearer \S+$/);
    return { credential: credential!, view: reply.body as unknown as Session['view'] };
  }
  async latestToken(email: string): Promise<string> {
    // Real outbox worker; no test-produced token or fabricated delivery result.
    const worker = this.app.get<{ dispatchPending(): Promise<void> }>('PATRON_OUTBOX_WORKER', { strict: false });
    await worker.dispatchPending();
    const message = this.mail.messages.filter(item => item.recipient === email).at(-1);
    expect(message, 'Debe haberse entregado un mensaje al transporte capturado').toBeDefined();
    for (const link of message!.text.matchAll(/https?:\/\/[^\s<>"']+/g)) {
      const token = new URL(link[0]).searchParams.get('token');
      if (token) return token;
    }
    throw new Error('El mensaje no contiene un enlace de un solo uso.');
  }
  async verifiedAccount() {
    const account = await this.register();
    const token = await this.latestToken(account.email);
    const verified = await this.request('POST', '/email-verification/confirm', { operationId: randomUUID(), token });
    expect(verified.status).toBe(200);
    expect(terminal(verified)).toMatchObject({ verified: true, loginRequired: true });
    return { ...account, session: await this.login(account.email) };
  }
  async accountRow(accountId: string) { return (await this.pool.query('SELECT * FROM accounts WHERE id=$1', [accountId])).rows[0] as Record<string, unknown>; }
  async scope(session: Session): Promise<string> {
    const reply = await this.request('GET', `/destructive-scope?kind=account&id=${session.view.accountId}&action=delete-account`, undefined, session);
    expect(reply.status).toBe(200); expect(reply.body.scopeRevision).toEqual(expect.any(String));
    return reply.body.scopeRevision as string;
  }
  async deleteAccount(session: Session, currentPassword = PASSWORD, operationId = randomUUID(), scopeRevision?: string) {
    return this.request('POST', '/account/deletion', { operationId, currentPassword, phrase: 'ELIMINAR MI CUENTA', scopeRevision: scopeRevision ?? await this.scope(session) }, session);
  }
  async runDueAccountJobs(): Promise<void> {
    const jobs = this.app.get<{ runDue(): Promise<void> }>('PATRON_ACCOUNT_LIFECYCLE_JOBS', { strict: false });
    await jobs.runDue();
  }
  async finishPurges(){await this.app.get(PurgeJobs,{strict:false}).run();}
  async finishAccountPurges(){await this.app.get(AccountPurgeJobs,{strict:false}).run();}
  async confirmPurge(requestId: string): Promise<void> {
    const jobs = this.app.get<{ confirmPurged(client: PoolClient, requestId: string): Promise<void> }>('PATRON_ACCOUNT_LIFECYCLE_JOBS', { strict: false });
    await inTransaction(this.pool, client => jobs.confirmPurged(client, requestId));
  }
}
export function terminal(reply: ApiReply): Record<string, unknown> {
  expect(reply.body).toMatchObject({ state: 'resolved', outcome: 'success', confirmedAt: expect.any(String) });
  expect(reply.body.data).toBeTypeOf('object');
  return reply.body.data as Record<string, unknown>;
}
export function rejected(reply: ApiReply, codes: string[]): void {
  expect(reply.status).toBeGreaterThanOrEqual(400);
  expect(reply.status).toBeLessThan(500);
  expect(codes).toContain(reply.body.code);
}
export async function startAccountHost(suppressionLog?:PurgeJournal,durableContent=false): Promise<AccountHost> {
  const connectionString = process.env.PATRON_TEST_DATABASE_URL;
  if (!connectionString) throw new Error('Ejecuta test:integration:local; no hay base remota alternativa.');
  const url = new URL(connectionString);
  if (url.hostname !== '127.0.0.1' || url.pathname !== '/patron_foundation_test') throw new Error('Base de ensayo no autorizada.');
  // Each host owns a schema so parallel suites cannot drain one another's mail
  // with different encryption keys or capture transports.
  const schema = 'account_test_' + randomUUID().replaceAll('-', '');
  const host = new AccountHost(new Pool({ connectionString, max: 8, connectionTimeoutMillis: 5000, options: `-c search_path=${schema}` }), schema,suppressionLog,durableContent);
  try { await host.pool.query(`CREATE SCHEMA ${schema}`); await host.start(); return host; } catch (error) { await host.close(); throw error; }
}

