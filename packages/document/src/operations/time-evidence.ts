import { DTO } from '../../../contracts/src/http-dto.js';
export interface TimeEvidence {responseId:string;continuity:string;receivedMonotonic:number;lower:number;upper:number}
/** The caller supplies an unpredictable, fresh nonce and a monotonic clock
 * whose continuity token changes whenever continuity cannot be proved. */
export function acceptTimeEvidence(input:unknown,nonce:string,clock:{continuity:string;sent:number;received:number}):TimeEvidence {
  const r=DTO.TimeView.parse(input),elapsed=clock.received-clock.sent;
  if(!nonce||r.nonce!==nonce||!clock.continuity||!Number.isFinite(clock.sent)||!Number.isFinite(clock.received)||elapsed<0||elapsed>30000)throw new Error('TIME_EVIDENCE_INVALID');
  const received=Date.parse(r.serverReceivedAt),sent=Date.parse(r.serverSentAt);
  // UTC timestamps have millisecond resolution. Expand, never narrow, bounds.
  const lower=sent-1,upper=received+elapsed+1;
  if(sent<received||lower>upper)throw new Error('TIME_EVIDENCE_INVALID');
  return {responseId:r.responseId,continuity:clock.continuity,receivedMonotonic:clock.received,lower,upper};
}
export function retentionState(e:TimeEvidence,deadline:number,clock:{continuity:string;now:number}):'valid'|'expired'|'uncertain'{
  const elapsed=clock.now-e.receivedMonotonic;
  if(clock.continuity!==e.continuity||!Number.isFinite(elapsed)||elapsed<0||!Number.isFinite(deadline)||!Number.isFinite(e.lower)||!Number.isFinite(e.upper)||e.lower>e.upper)return 'uncertain';
  if(e.lower+elapsed>=deadline)return 'expired';if(e.upper+elapsed<deadline)return 'valid';return 'uncertain';
}
