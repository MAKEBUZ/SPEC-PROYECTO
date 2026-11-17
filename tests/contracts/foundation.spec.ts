import { expect, it } from 'vitest';
import { DTO, parseRequest } from '../../packages/contracts/src/http-dto.js';
import { openApiDocument } from '../../packages/contracts/src/openapi.js';
import { ROUTES } from '../../packages/contracts/src/routes.js';
import { readFileSync } from 'node:fs';

const operationId = '60b46cae-4f0b-4c0f-9456-2a6084fe8044';
it('rechaza campos de propiedad o fechas impuestas por clientes y no convierte tipos', () => {
  expect(() => parseRequest('CreateProject', { operationId, name: 'Patrón', ownerId: operationId })).toThrow();
  expect(() => DTO.Pagination.parse({ limit: '25' })).toThrow();
  expect(() => DTO.Pagination.parse({ limit: 101 })).toThrow();
  expect(DTO.Pagination.parse({ limit: 25 })).toEqual({ limit: 25 });
});
it('exige confirmaciones explícitas y conserva la contraseña sin normalizar', () => {
  expect(() => parseRequest('PurgeResource', { operationId, scopeRevision: 'scope', confirmation: true, acknowledgePermanentLoss: false })).toThrow();
  const password = ' Abcd1234! e\u0301 ';
  expect(parseRequest('Register', { operationId, email: 'a@example.invalid', password }).password).toBe(password);
});
it('distingue estado pendiente y terminal de la credencial de eliminación', () => {
  expect(DTO.DeletionStatus.parse({ requestId: operationId, state: 'pending' })).toEqual({ requestId: operationId, state: 'pending' });
  expect(() => DTO.DeletionStatus.parse({ requestId: operationId, state: 'deleted' })).toThrow();
});
it('OpenAPI publicado coincide con los DTO y cubre cada ruta aprobada', () => {
  const api = openApiDocument();
  expect(JSON.parse(readFileSync('docs/api/openapi.json', 'utf8'))).toEqual(api);
  for (const route of Object.values(ROUTES)) expect(api.paths[route.path]?.[route.method]).toBeDefined();
  const refs = JSON.stringify(api).matchAll(/"\$ref":"#\/components\/schemas\/([^"]+)"/g);
  for (const ref of refs) expect(Object.hasOwn(api.components.schemas, ref[1]!)).toBe(true);
  expect(Object.keys(ROUTES)).toHaveLength(40);
  expect(ROUTES.abandonPublication).toMatchObject({access:'normal',body:'Operation',response:'MutationResult'});
});
it('rechaza publicaciones incompletas y cambios ambiguos de patrón', () => {
  expect(() => parseRequest('BeginPublication', { operationId, projectId: operationId, patternName: 'Patrón', manifest: { documentId: operationId, localRevisionId: 'a'.repeat(64), manifestHash: 'b'.repeat(64), files: [] } })).toThrow();
  expect(() => DTO.FileView.parse({ id: operationId, role: 'pdf', originalName: 'p.pdf', mediaType: 'application/pdf', bytes: 100000001, sha256: 'a'.repeat(64), documentId: operationId, localRevisionId: 'b'.repeat(64) })).toThrow();
});
