import { expect, it, vi } from 'vitest';
import { IpcRouter } from '../../apps/desktop/src/main/ipc-router.js';
import { CapabilityRegistry } from '../../apps/desktop/src/main/ipc-boundary.js';

it('rechaza un requestId repetido sin repetir el efecto local', async () => {
  const handler = vi.fn(async () => ({ requestId: 'ignored', status: 'cancelled' as const }));
  const router = new IpcRouter(new CapabilityRegistry(), { 'document.open': handler }, () => true);
  const request = { requestId: 'one', method: 'document.open' };
  expect(await router.dispatch(request, 1, 'file:///app', 'file:///app', true)).toEqual({ requestId: 'one', status: 'cancelled' });
  expect((await router.dispatch(request, 1, 'file:///app', 'file:///app', true)).status).toBe('error');
  expect(handler).toHaveBeenCalledTimes(1);
});

it('no llama handlers desde un subframe u origen ajeno ni revela errores internos', async () => {
  const handler = vi.fn(async (): Promise<never> => { throw new Error('C:/private/token'); });
  const router = new IpcRouter(new CapabilityRegistry(), { 'document.open': handler }, () => true);
  const request = { requestId: 'one', method: 'document.open' };
  await router.dispatch(request, 1, 'https://evil.invalid', 'file:///app', true);
  await router.dispatch(request, 1, 'file:///app', 'file:///app', false);
  expect(handler).not.toHaveBeenCalled();
  const result = await router.dispatch(request, 1, 'file:///app', 'file:///app', true);
  expect(JSON.stringify(result)).not.toContain('private');
});
it('bloquea handlers CAD antes de habilitación local y conserva acceso tras logout remoto', async () => {
  let enabled = false;
  const handler = vi.fn(async () => ({ requestId: '', status: 'success' as const, data: {} }));
  const router = new IpcRouter(new CapabilityRegistry(), { 'document.open': handler }, () => enabled);
  expect(await router.dispatch({ requestId: 'a', method: 'document.open' }, 1, 'file:///app', 'file:///app', true)).toMatchObject({ status: 'error', error: { code: 'SESSION_REQUIRED' } });
  expect(handler).not.toHaveBeenCalled(); enabled = true;
  expect((await router.dispatch({ requestId: 'b', method: 'document.open' }, 1, 'file:///app', 'file:///app', true)).status).toBe('success');
});
