import { confirmedTimeCheck, retryDelay, type ClockSample, type TimeCheckState } from './time-check.js';
import { applyDeletedHistory,checkClosedRetention,validateAccountHistory,type AccountHistory } from './closed.js';
import { OperationJournal } from './journal.js';
import {RECOVERY_NOTICE} from './history-storage.js';

/** One storage lane, independent of connectivity and query timeout. The adapter
 * must resolve only after durable write and read-back validation. */
export class TimeResultWriter {
  private current: TimeCheckState;
  private running: Promise<void> | undefined;
  private failures = 0;
  private wait: { clock: ClockSample; duration: number } | undefined;
  private failed = false;
  constructor(state: TimeCheckState, private readonly persist: (state: TimeCheckState) => Promise<void>,
    private readonly clock: () => ClockSample) {
    if (state.phase !== 'save_pending' || !state.evidence) throw new Error('TIME_RESULT_NOT_READY');
    this.current = structuredClone(state);
  }
  get state(): TimeCheckState { return structuredClone(this.current); }
  get notice(): string | null {
    return this.failed ? 'No se pudo guardar la comprobación. Se reintentará automáticamente.' : null;
  }
  /** Called by the application scheduler; concurrent triggers share one write. */
  tick(open: boolean): Promise<void> {
    if (this.running) return this.running;
    if (!open || this.current.phase !== 'save_pending') return Promise.resolve();
    const now = this.clock();
    if (!now.continuity || !Number.isFinite(now.now) || now.now < 0) return Promise.resolve();
    if (this.wait) {
      if (now.continuity !== this.wait.clock.continuity || now.now < this.wait.clock.now) {
        this.wait.clock = { ...now };
        return Promise.resolve();
      }
      if (now.now - this.wait.clock.now < this.wait.duration) return Promise.resolve();
    }
    const committed = confirmedTimeCheck(this.current);
    // Start in a microtask so even a synchronous adapter throw follows the same
    // failure path and the in-flight guard is installed before execution.
    this.running = Promise.resolve().then(() => this.persist(structuredClone(committed))).then(() => {
      this.current = committed; this.failed = false; this.failures = 0; this.wait = undefined;
    }, () => {
      this.failed = true; this.failures = Math.min(6, this.failures + 1);
      this.wait = { clock: { ...this.clock() }, duration: retryDelay(this.failures) };
    }).finally(() => { this.running = undefined; });
    return this.running;
  }
}
export interface HistoryMaintenancePorts {
 cleanupRelated?:((accountId:string)=>Promise<void>)|undefined;
 load():Promise<AccountHistory>;
 /** Durable, validated write; failure must never authorize cleanup. */
 save(history:AccountHistory):Promise<void>;
 clock():ClockSample;
 time():Promise<TimeCheckState|undefined>;
}
/** Offline storage lane. App scheduler calls tick; there is no manual cleanup,
 * account credential, document access or remote mutation in this coordinator. */
export class HistoryMaintenance {
 private running:Promise<void>|undefined;
 private pending:AccountHistory|undefined;
 private failureKind:'save'|'cleanup'|'recovery'='cleanup';
 private failures=0;private wait:{clock:ClockSample;duration:number}|undefined;private failed=false;
 constructor(private readonly journal:OperationJournal,private readonly ports:HistoryMaintenancePorts){}
 get notice(){return !this.failed?null:this.failureKind==='recovery'?RECOVERY_NOTICE:this.failureKind==='save'?'No se pudo guardar el estado local. Se reintentará automáticamente.':'No se pudo completar la limpieza local. Se reintentará automáticamente.';}
 get storageBlocked(){return this.pending!==undefined;}
 private async persist(history:AccountHistory){this.pending=structuredClone(history);await this.ports.save(structuredClone(history));this.pending=undefined;}
 tick(open:boolean):Promise<void>{
  if(this.running)return this.running;if(!open)return Promise.resolve();
  const now=this.ports.clock();if(!now.continuity||!Number.isFinite(now.now)||now.now<0)return Promise.resolve();
  if(this.wait){if(now.continuity!==this.wait.clock.continuity||now.now<this.wait.clock.now){this.wait.clock={...now};return Promise.resolve();}if(now.now-this.wait.clock.now<this.wait.duration)return Promise.resolve();}
  this.running=Promise.resolve().then(async()=>{
   const stored=validateAccountHistory(this.pending??await this.ports.load());if(stored.phase!=='deleted')return;
   const next=checkClosedRetention(stored,now,stored.retention?.state==='expired'?undefined:await this.ports.time());
   // Durable expiry/account gate always precedes journal removal. A failed
   // write leaves every candidate and block intact for a later attempt.
   await this.persist(next);
   const closed=await applyDeletedHistory(this.journal,next);await this.persist(closed);
   if(closed.retention!.state==='expired')for(const entry of closed.entries)await this.journal.retireClosed(closed.accountId,entry.operationId);
   for(const id of await this.journal.removedIds(closed.accountId))await this.journal.compact(closed.accountId,id);
   if(closed.retention!.state==='expired'){await this.ports.cleanupRelated?.(closed.accountId);await this.persist({...closed,entries:[]});}
  }).then(()=>{this.failed=false;this.failures=0;this.wait=undefined;},(error:unknown)=>{
   this.failureKind=error instanceof Error&&/HISTORY_RECOVERY_UNAVAILABLE|HISTORY_DAMAGED|JOURNAL_DAMAGED/.test(error.message)?'recovery':this.pending?'save':'cleanup';
   this.failed=true;this.failures=Math.min(6,this.failures+1);this.wait={clock:{...this.ports.clock()},duration:retryDelay(this.failures)};
  }).finally(()=>{this.running=undefined;});return this.running;
 }
}
