import { DTO } from './http-dto.js';
import { HTTP_ERRORS } from './http.js';
import { ROUTES } from './routes.js';
import type { RouteContract } from './routes.js';

export function openApiDocument() {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const [operationId, definition] of Object.entries(ROUTES)) {
    const route: RouteContract = definition;
    const parameters: unknown[] = [...route.path.matchAll(/\{([^}]+)\}/g)].map(match => ({ in: 'path', name: match[1], required: true, schema: match[1] === 'kind' ? { type: 'string', enum: ['project', 'pattern'] } : { type: 'string', format: 'uuid' } }));
    if (route.query) {
      const schema = DTO[route.query].json;
      const required = schema.required as string[];
      for (const [name, field] of Object.entries(schema.properties as Record<string, unknown>)) parameters.push({ in: 'query', name, required: required.includes(name), schema: field });
    }
    if (operationId === 'download') parameters.push({ in: 'header', name: 'Range', required: false, schema: { type: 'string' } });
    if (operationId === 'upload') parameters.push({ in: 'header', name: 'Content-Length', required: true, schema: { type: 'integer', minimum: 0, maximum: 100000000 } });
    const responses: Record<string, unknown> = {};
    for (const status of new Set(Object.values(HTTP_ERRORS))) responses[status] = { description: 'Error estable; no implica confirmación de operación.', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } };
    const responseSchema = route.response ?? (route.body && operationId !== 'resetRequest' ? 'MutationResult' : undefined);
    responses[route.status ?? 200] = { description: route.binary ? 'Bytes autorizados; recepción confirmada solo tras persistencia.' : 'Resultado conforme al contrato. Credenciales se entregan solo por su canal autorizado; nunca por consulta de operación.', ...(responseSchema ? { content: { 'application/json': { schema: { $ref: '#/components/schemas/' + responseSchema } } } } : {}) };
    if (route.body) responses[202] ??= { description: 'Resultado pendiente; no representa éxito de negocio.' };
    const operation: Record<string, unknown> = {
      operationId, parameters, responses, 'x-access-class': route.access,
      security: route.access === 'public' ? [] : route.access === 'deletion_credential' ? [{ deletionCredential: [] }] : [{ bearerSession: [] }, { cookieSession: [] }],
    };
    if (route.body) operation.requestBody = { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/' + route.body } } } };
    if (route.binary && route.method === 'put') operation.requestBody = { required: true, content: { 'application/octet-stream': { schema: { type: 'string', format: 'binary' } } } };
    const path = paths[route.path] ??= {}; path[route.method] = operation;
  }
  return { openapi: '3.1.0', info: { title: 'PATRONAJE — primera entrega', version: '0.1.0', description: 'Contrato generado desde DTO; no declara endpoints funcionales. Cookie: CSRF y Origin obligatorios en mutaciones, también login/logout. Todas las respuestas privadas: Cache-Control no-store.' }, servers: [{ url: '/v1' }], paths,
    components: { securitySchemes: { bearerSession: { type: 'http', scheme: 'bearer' }, cookieSession: { type: 'apiKey', in: 'cookie', name: '__Host-patron-session' }, deletionCredential: { type: 'http', scheme: 'bearer', description: 'Capacidad limitada a una solicitud; no sesión normal.' } }, schemas: Object.fromEntries(Object.entries(DTO).map(([name, dto]) => [name, dto.json])) },
  };
}
