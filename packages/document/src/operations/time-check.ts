import { acceptTimeEvidence, retentionState, type TimeEvidence } from './time-evidence.js';

export interface ClockSample { continuity: string; now: number }
export type TimeCheckState = {
  phase: 'pending' | 'querying' | 'save_pending' | 'complete';
  failures: number;
  warning: boolean;
  wait?: { continuity: string; started: number; duration: number };
  attempt?: { id: string; nonce: string; clock: ClockSample };
  evidence?: TimeEvidence;
};
export const newTimeCheck = (): TimeCheckState => ({ phase: 'pending', failures: 0, warning: false });
/** Persisted records never contain save_pending: the received result is not a
 * completed check until its durable complete generation has been verified. */
export function validateStoredTimeCheck(input:unknown):TimeCheckState {
  const bad=()=>{throw new Error('TIME_CHECK_DAMAGED');};
  if(!input||typeof input!=='object'||Array.isArray(input))return bad();
  const s=input as TimeCheckState;
  if(Object.keys(s).some(k=>!['phase','failures','warning','wait','attempt','evidence'].includes(k))||!['pending','querying','complete'].includes(s.phase)||!Number.isInteger(s.failures)||s.failures<0||s.failures>6||typeof s.warning!=='boolean')return bad();
  if(s.phase==='pending'){
    if(s.attempt!==undefined||s.evidence!==undefined)return bad();
    if(s.wait!==undefined){
      if(!s.wait||typeof s.wait!=='object'||!s.wait.continuity||typeof s.wait.continuity!=='string'||!Number.isFinite(s.wait.started)||s.wait.started<0||s.failures===0||s.wait.duration!==retryDelay(s.failures))return bad();
    }
  }else if(s.phase==='querying'){
    const a=s.attempt;
    if(s.wait!==undefined||s.evidence!==undefined||!a||typeof a.id!=='string'||!a.id||typeof a.nonce!=='string'||!a.nonce||!a.clock||typeof a.clock.continuity!=='string'||!a.clock.continuity||!Number.isFinite(a.clock.now)||a.clock.now<0)return bad();
  }else{
    const e=s.evidence;
    if(s.failures!==0||s.warning||s.wait!==undefined||s.attempt!==undefined||!e||typeof e.responseId!=='string'||!e.responseId||typeof e.continuity!=='string'||!e.continuity||!Number.isFinite(e.receivedMonotonic)||e.receivedMonotonic<0||!Number.isFinite(e.lower)||!Number.isFinite(e.upper)||e.lower>e.upper)return bad();
  }
  return structuredClone(s);
}
export function retryDelay(failures: number): number {
  return [5000, 10000, 20000, 40000, 80000, 120000][Math.min(5, Math.max(0, failures - 1))]!;
}
function validClock(clock: ClockSample): void {
  if (!clock.continuity || !Number.isFinite(clock.now) || clock.now < 0) throw new Error('INVALID_MONOTONIC_CLOCK');
}
function elapsed(start: ClockSample, current: ClockSample): number | undefined {
  validClock(current);
  if (start.continuity !== current.continuity || current.now < start.now) return undefined;
  return current.now - start.now;
}
function fail(state: TimeCheckState, clock: ClockSample): TimeCheckState {
  validClock(clock);
  const failures = Math.min(6, state.failures + 1);
  return { phase: 'pending', failures, warning: true,
    wait: { continuity: clock.continuity, started: clock.now, duration: retryDelay(failures) } };
}

/** Pure transitions. The lifecycle owner must durably persist each transition before
 * issuing its effect. A query marker survives a crash; save_pending evidence stays
 * in memory until commit succeeds. No transition reads the device's civil clock. */
export function resumeTimeCheck(state: TimeCheckState, clock: ClockSample): TimeCheckState {
  validClock(clock);
  if (state.phase === 'querying' || state.phase === 'save_pending') return fail(state, clock);
  if (!state.wait) return state;
  const passed = elapsed({ continuity: state.wait.continuity, now: state.wait.started }, clock);
  return passed === undefined
    ? { ...state, wait: { ...state.wait, continuity: clock.continuity, started: clock.now } }
    : state;
}
export function beginTimeQuery(state: TimeCheckState, clock: ClockSample,
  input: { open: boolean; online: boolean; id: string; nonce: string }): TimeCheckState {
  validClock(clock);
  if (!input.open || !input.online || state.phase !== 'pending') return state;
  if (state.wait) {
    const passed = elapsed({ continuity: state.wait.continuity, now: state.wait.started }, clock);
    if (passed === undefined || passed < state.wait.duration) return state;
  }
  if (!input.id || !input.nonce) throw new Error('TIME_QUERY_IDENTITY_REQUIRED');
  return { phase: 'querying', failures: state.failures, warning: state.warning,
    attempt: { id: input.id, nonce: input.nonce, clock: { ...clock } } };
}
export function interruptTimeQuery(state: TimeCheckState, clock: ClockSample,
  reason: 'close' | 'disconnect' | 'suspend' | 'failure'): TimeCheckState {
  if (state.phase !== 'querying') return state;
  if (reason === 'close') return { phase: 'pending', failures: state.failures, warning: state.warning };
  return fail(state, clock);
}
export function timeQueryTick(state: TimeCheckState, clock: ClockSample): TimeCheckState {
  if (state.phase !== 'querying' || !state.attempt) return state;
  const passed = elapsed(state.attempt.clock, clock);
  return passed === undefined || passed >= 30000 ? fail(state, clock) : state;
}
export function receiveTimeQuery(state: TimeCheckState, id: string, response: unknown,
  clock: ClockSample): TimeCheckState {
  if (state.phase !== 'querying' || state.attempt?.id !== id) return state;
  const checked = timeQueryTick(state, clock);
  if (checked !== state) return checked;
  try {
    const evidence = acceptTimeEvidence(response, state.attempt.nonce, {
      continuity: clock.continuity, sent: state.attempt.clock.now, received: clock.now,
    });
    return { phase: 'save_pending', failures: state.failures, warning: state.warning, evidence };
  } catch { return fail(state, clock); }
}
/** Build the durable value; expose it as current only after the write succeeds.
 * Failed writes retain the original save_pending value and retry only storage. */
export function confirmedTimeCheck(state: TimeCheckState): TimeCheckState {
  if (state.phase !== 'save_pending' || !state.evidence) throw new Error('TIME_RESULT_NOT_READY');
  return { phase: 'complete', failures: 0, warning: false, evidence: state.evidence };
}
export function checkStoredTime(state: TimeCheckState, deadline: number, clock: ClockSample): {
  state: TimeCheckState; retention: 'valid' | 'expired' | 'uncertain';
} {
  if (state.phase !== 'complete' || !state.evidence) return { state, retention: 'uncertain' };
  const retention = retentionState(state.evidence, deadline, clock);
  return { state: retention === 'uncertain' ? newTimeCheck() : state, retention };
}
