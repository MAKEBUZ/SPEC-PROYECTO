import { expect, it } from 'vitest';
import { TimeResultWriter } from '../../packages/document/src/operations/maintenance.js';
import type { TimeCheckState } from '../../packages/document/src/operations/time-check.js';
const pending = (): TimeCheckState => ({ phase: 'save_pending', failures: 3, warning: true,
  evidence: { responseId: 'confirmed', continuity: 'boot', receivedMonotonic: 10, lower: 100, upper: 110 } });
it('retains evidence and query backoff after failed writes; retries storage alone and clears notice on success', async () => {
  let now = 100, writes = 0;
  const writer = new TimeResultWriter(pending(), async () => { if (++writes < 3) throw new Error('disk full'); }, () => ({ now, continuity: 'boot' }));
  await writer.tick(true);
  expect(writer.state).toEqual(pending()); expect(writer.notice).toContain('Se reintentará');
  now = 5099; await writer.tick(true); expect(writes).toBe(1);
  now = 5100; await writer.tick(true); expect(writes).toBe(2);
  now = 15099; await writer.tick(true); expect(writes).toBe(2);
  now = 15100; await writer.tick(false); expect(writes).toBe(2);
  await writer.tick(true); expect(writes).toBe(3);
  expect(writer.state).toEqual({ phase: 'complete', failures: 0, warning: false, evidence: pending().evidence });
  expect(writer.notice).toBeNull();
  await writer.tick(true); expect(writes).toBe(3);
});
it('shares a single slow write and cannot expose completion before persistence confirms', async () => {
  let release!: () => void, writes = 0;
  const writer = new TimeResultWriter(pending(), async value => {
    writes++; value.failures = 999; await new Promise<void>(resolve => { release = resolve; });
  }, () => ({ now: 0, continuity: 'boot' }));
  const first = writer.tick(true); expect(writer.tick(true)).toBe(first);
  await Promise.resolve(); expect(writes).toBe(1); expect(writer.state.phase).toBe('save_pending');
  release(); await first; expect(writer.state.phase).toBe('complete'); expect(writer.state.failures).toBe(0);
});
it('restarts only the current storage wait on uncertain clock continuity', async () => {
  let now = 0, continuity = 'boot', writes = 0;
  const writer = new TimeResultWriter(pending(), async () => { writes++; throw new Error('unavailable'); }, () => ({ now, continuity }));
  await writer.tick(true);
  continuity = 'new'; now = 10; await writer.tick(true); expect(writes).toBe(1);
  now = 5009; await writer.tick(true); expect(writes).toBe(1);
  now = 5010; await writer.tick(true); expect(writes).toBe(2);
});
