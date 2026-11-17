import { Controller, Module, Post } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { request } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Readable, Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { beforeAll, afterAll, expect, it, vi } from 'vitest';
import { ContractRoute } from '../../apps/api/src/http/access.js';
import { createLocalApi } from '../../apps/api/src/http/bootstrap.js';
import { FileSizeLimit, MAX_FILE_BYTES } from '../../apps/api/src/http/transport.js';

let effects = 0;
@Controller('projects')
class TestController {
  @Post()
  @ContractRoute('createProject')
  create() { effects++; return { accepted: true }; }
}
@Module({ controllers: [TestController] })
class TestModule {}
let app: INestApplication;
let base: string;
let authorized = true;
let log: ReturnType<typeof vi.spyOn>;
beforeAll(async () => {
  log = vi.spyOn(console, 'error').mockImplementation(() => {});
  app = await createLocalApi(TestModule, async () => authorized ? { kind: 'session', accountId: 'test', accessClass: 'normal', accountStatus: 'active', verified: true, expiresAt: Date.now() + 60000, revoked: false } : undefined);
  await app.listen(0, '127.0.0.1');
  base = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}/v1`;
});
afterAll(async () => { await app?.close(); log?.mockRestore(); });
const operationId = '60b46cae-4f0b-4c0f-9456-2a6084fe8044';
const send = (body: string) => fetch(base + '/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });

it('valida cuerpo antes del controlador y devuelve respuestas no cacheables', async () => {
  const rejected = await send(JSON.stringify({ operationId, name: 'Proyecto', ownerId: operationId }));
  expect(rejected.status).toBe(400);
  expect(effects).toBe(0);
  const accepted = await send(JSON.stringify({ operationId, name: 'Proyecto' }));
  expect(accepted.status).toBe(201);
  expect(accepted.headers.get('cache-control')).toBe('no-store');
  expect(effects).toBe(1);
});
it('rechaza JSON duplicado y UTF-8 mal formado', async () => {
  const duplicate = await send(`{"operationId":"${operationId}","name":"uno","name":"dos"}`);
  expect(duplicate.status).toBe(400);
  const malformed = await fetch(base + '/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: new Uint8Array([123, 34, 120, 34, 58, 34, 0xff, 34, 125]) });
  expect(malformed.status).toBe(400);
});
it('rechaza sesión ausente y conserva 404 para ruta no disponible', async () => {
  authorized = false;
  try { expect((await send(JSON.stringify({ operationId, name: 'Proyecto' }))).status).toBe(401); }
  finally { authorized = true; }
  expect((await fetch(base + '/missing')).status).toBe(404);
});
it('rechaza Content-Length por encima de 100 MB sin recibir ni procesar el archivo', async () => {
  const status = await new Promise<number | undefined>((resolve, reject) => {
    const req = request(base + '/projects', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': MAX_FILE_BYTES + 1 } }, response => {
      resolve(response.statusCode); response.resume(); req.destroy();
    });
    req.on('error', reject); req.end();
  });
  expect(status).toBe(413);
});
it('el contador de bytes admite el límite exacto y bloquea exceso aunque el encabezado mienta', async () => {
  const collect = () => new Writable({ write(_chunk, _encoding, next) { next(); } });
  await expect(pipeline(Readable.from([Buffer.from('abc'), Buffer.from('de')]), new FileSizeLimit(5), collect())).resolves.toBeUndefined();
  await expect(pipeline(Readable.from([Buffer.from('abc'), Buffer.from('def')]), new FileSizeLimit(5), collect())).rejects.toMatchObject({ code: 'FILE_TOO_LARGE' });
});
