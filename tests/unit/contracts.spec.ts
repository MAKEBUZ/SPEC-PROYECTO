import { expect, it } from 'vitest';
import { parseIpcRequest } from '../../packages/contracts/src/ipc.js';
import { errorResponse } from '../../packages/contracts/src/http.js';

it('el IPC no acepta rutas arbitrarias ni operaciones desconocidas', () => {
  expect(() => parseIpcRequest({ requestId: 'a', method: 'document.open', path: 'C:/private' })).toThrow();
  expect(() => parseIpcRequest({ requestId: 'a', method: 'shell.exec', command: 'anything' })).toThrow();
  expect(parseIpcRequest({ requestId: 'a', method: 'document.open' })).toEqual({ requestId: 'a', method: 'document.open' });
});
it('un error HTTP no expone mensajes de excepción internos', () => {
  expect(errorResponse('INTERNAL_ERROR', 'trace-1')).toEqual({ code: 'INTERNAL_ERROR', message: 'No se pudo completar la operación.', traceId: 'trace-1' });
});
