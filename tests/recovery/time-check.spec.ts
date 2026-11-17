import { expect, it } from 'vitest';
import { beginTimeQuery, checkStoredTime, confirmedTimeCheck, interruptTimeQuery, newTimeCheck,
  receiveTimeQuery, resumeTimeCheck, retryDelay, timeQueryTick, type TimeCheckState } from '../../packages/document/src/operations/time-check.js';
const clock = (now: number, continuity = 'boot') => ({ now, continuity });
const begin = (state = newTimeCheck(), now = 0, id = 'query') => beginTimeQuery(state, clock(now), { open: true, online: true, id, nonce: id });
const response = (nonce = 'query') => ({ nonce, responseId: '80000000-0000-4000-8000-000000000001',
  serverReceivedAt: '2026-11-15T00:00:00.000Z', serverSentAt: '2026-11-15T00:00:00.001Z' });

it('admits a single query, never queues triggers, and requires open and online', () => {
  const initial = newTimeCheck(), query = begin(initial);
  expect(begin(query, 1, 'other')).toBe(query);
  for (const input of [{ open: false, online: true }, { open: true, online: false }]) {
    expect(beginTimeQuery(initial, clock(0), { ...input, id: 'q', nonce: 'n' })).toBe(initial);
  }
  const failed = interruptTimeQuery(query, clock(10), 'failure');
  expect(begin(failed, 5009)).toBe(failed);
  expect(begin(failed, 5010).phase).toBe('querying');
});
it('uses the exact failure sequence from the end of each attempt and saturates', () => {
  let state = newTimeCheck(), now = 0;
  for (const delay of [5000, 10000, 20000, 40000, 80000, 120000, 120000]) {
    state = interruptTimeQuery(begin(state, now), clock(now + 123), 'failure');
    expect(state.wait).toEqual({ continuity: 'boot', started: now + 123, duration: delay });
    now += 123 + delay;
  }
});
it('times out at 30 seconds and rejects expired or interrupted responses', () => {
  const query = begin();
  expect(timeQueryTick(query, clock(29999))).toBe(query);
  const timeout = receiveTimeQuery(query, 'query', response(), clock(30000));
  expect(timeout.phase).toBe('pending'); expect(timeout.failures).toBe(1);
  expect(receiveTimeQuery(timeout, 'query', response(), clock(30001))).toBe(timeout);
  const newer = begin(timeout, 35000, 'new');
  expect(receiveTimeQuery(newer, 'query', response(), clock(35001))).toBe(newer);
});
it('counts suspension/disconnection once, including suspended time in the wait', () => {
  const failed = interruptTimeQuery(begin(), clock(100), 'suspend');
  expect(interruptTimeQuery(failed, clock(101), 'disconnect')).toBe(failed);
  expect(timeQueryTick(failed, clock(30000))).toBe(failed);
  expect(begin(resumeTimeCheck(failed, clock(5100)), 5100).phase).toBe('querying');
});
it('preserves waits across reopening and replaces only uncertain elapsed time', () => {
  const failed = interruptTimeQuery(begin(), clock(100), 'failure');
  expect(resumeTimeCheck(failed, clock(1000))).toBe(failed);
  const recovered = resumeTimeCheck(failed, clock(20, 'new-boot'));
  expect(recovered.failures).toBe(1);
  expect(recovered.wait).toEqual({ continuity: 'new-boot', started: 20, duration: 5000 });
  expect(resumeTimeCheck(recovered, clock(30, 'new-boot'))).toBe(recovered);
});
it('distinguishes voluntary close from a crash and counts a persisted interruption once', () => {
  const query = begin();
  const closed = interruptTimeQuery(query, clock(1), 'close');
  expect(closed.failures).toBe(0); expect(receiveTimeQuery(closed, 'query', response(), clock(2))).toBe(closed);
  const crash = resumeTimeCheck(JSON.parse(JSON.stringify(query)), clock(10));
  expect(crash.failures).toBe(1);
  expect(resumeTimeCheck(JSON.parse(JSON.stringify(crash)), clock(20))).toEqual(crash);
});
it('stops query timeout before storage and resets retries only in the committed value', () => {
  const failed = interruptTimeQuery(begin(), clock(1), 'failure');
  const saving = receiveTimeQuery(begin(failed, 5001), 'query', response(), clock(5010));
  expect(saving.phase).toBe('save_pending'); expect(saving.failures).toBe(1); expect(saving.warning).toBe(true);
  expect(timeQueryTick(saving, clock(90000))).toBe(saving);
  expect(begin(saving, 90000)).toBe(saving);
  expect(interruptTimeQuery(saving, clock(90000), 'disconnect')).toBe(saving);
  const complete = confirmedTimeCheck(saving);
  expect(complete.failures).toBe(0); expect(complete.warning).toBe(false);
  expect(saving.failures).toBe(1);
  expect(() => confirmedTimeCheck(newTimeCheck())).toThrow('TIME_RESULT_NOT_READY');
});
it('uses saved evidence after reopen without declaring historical validity current', () => {
  const complete = confirmedTimeCheck(receiveTimeQuery(begin(), 'query', response(), clock(10)));
  const deadline = Date.parse(response().serverSentAt) + 100;
  expect(checkStoredTime(complete, deadline, clock(20)).retention).toBe('valid');
  expect(checkStoredTime(complete, deadline, clock(200)).retention).toBe('expired');
  const uncertain = checkStoredTime(complete, deadline, clock(20, 'reboot'));
  expect(uncertain.retention).toBe('uncertain'); expect(uncertain.state.phase).toBe('pending');
});
it('rejects malformed evidence and invalid clocks without interpreting either as expiration', () => {
  expect(receiveTimeQuery(begin(), 'query', response('wrong'), clock(10)).phase).toBe('pending');
  expect(() => begin(newTimeCheck(), NaN)).toThrow('INVALID_MONOTONIC_CLOCK');
  expect(retryDelay(100)).toBe(120000);
});
