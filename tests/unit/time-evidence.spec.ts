import { it,expect } from 'vitest';
import { acceptTimeEvidence,retentionState } from '../../packages/document/src/operations/time-evidence.js';
const response={nonce:'request-unique',responseId:'80000000-0000-4000-8000-000000000001',serverReceivedAt:'2026-11-15T00:00:00.000Z',serverSentAt:'2026-11-15T00:00:00.005Z'};
it('uses the entire uncertainty interval and monotonic continuity instead of the civil clock',()=>{
  const evidence=acceptTimeEvidence(response,'request-unique',{continuity:'boot-1',sent:100,received:120});
  const start=Date.parse(response.serverReceivedAt);expect(retentionState(evidence,start+10,{continuity:'boot-1',now:120})).toBe('uncertain');
  expect(retentionState(evidence,start+100,{continuity:'boot-1',now:120})).toBe('valid');expect(retentionState(evidence,start+100,{continuity:'boot-1',now:220})).toBe('expired');
  expect(retentionState(evidence,start+100,{continuity:'new-boot',now:220})).toBe('uncertain');expect(retentionState(evidence,start+100,{continuity:'boot-1',now:119})).toBe('uncertain');
});
it('rejects stale, timed out, reversed or inconsistent evidence',()=>{
  const stamp={continuity:'boot',sent:0,received:20};
  expect(()=>acceptTimeEvidence(response,'other',stamp)).toThrow();
  expect(()=>acceptTimeEvidence(response,response.nonce,{...stamp,received:30001})).toThrow();
  expect(()=>acceptTimeEvidence({...response,serverSentAt:'2026-11-14T00:00:00.000Z'},response.nonce,stamp)).toThrow();
  expect(()=>acceptTimeEvidence({...response,serverSentAt:'2026-11-15T00:00:01.000Z'},response.nonce,stamp)).toThrow();
});
