import { expect, it } from 'vitest';
import { parseIpcRequest } from '../../packages/contracts/src/ipc.js';
it('cuenta IPC exige confirmación y no admite rutas, credenciales ni operaciones de eliminación arbitrarias', () => {
  expect(() => parseIpcRequest({ requestId: 'a', method: 'account.logoutAll', confirmed: false })).toThrow();
  expect(() => parseIpcRequest({ requestId: 'b', method: 'account.login', email: 'a', password: 'b', credential: 'secret' })).toThrow();
  expect(() => parseIpcRequest({ requestId: 'c', method: 'account.checkDeletion', requestIdToCheck: 'x' })).toThrow();
  expect(() => parseIpcRequest({ requestId: 'd', method: 'account.status', path: 'C:/secret' })).toThrow();
  expect(parseIpcRequest({ requestId: 'e', method: 'account.logoutAll', confirmed: true }).method).toBe('account.logoutAll');
});
