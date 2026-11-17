import { expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ active: 0, peak: 0, calls: 0 }));
vi.mock('argon2', () => ({
  argon2id: 2,
  hash: async () => {
    state.active++; state.peak = Math.max(state.peak, state.active); const call = ++state.calls;
    try { await new Promise(resolve => setTimeout(resolve, 10)); if (call === 1) throw new Error('Fallo nativo de ensayo'); return 'encoded'; }
    finally { state.active--; }
  },
  verify: async () => { state.active++; state.peak = Math.max(state.peak, state.active); try { await new Promise(resolve => setTimeout(resolve, 10)); return true; } finally { state.active--; } },
}));
import { PasswordService } from '../../apps/api/src/auth/password.service.js';

it('limita Argon2 en todo el proceso y libera la cola tras un fallo', async () => {
  const first = new PasswordService({ has: async () => false }), second = new PasswordService({ has: async () => false });
  const results = await Promise.allSettled([first.hashNew('Correcta-42!Texto'), second.hashNew('Correcta-43!Texto'), first.verify('$argon2id$fixture', 'establecida')]);
  expect(results.filter(result => result.status === 'rejected')).toHaveLength(1);
  expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(2);
  expect(state.peak).toBe(1); expect(state.active).toBe(0);
});
