import { beginTimeQuery,checkStoredTime,interruptTimeQuery,newTimeCheck,receiveTimeQuery,resumeTimeCheck,timeQueryTick,type ClockSample,type TimeCheckState } from './time-check.js';
import { TimeResultWriter } from './maintenance.js';
export interface TimeCyclePorts {
  load():Promise<TimeCheckState>;
  save(state:TimeCheckState):Promise<void>;
  query(nonce:string,signal:AbortSignal):Promise<unknown>;
  clock():ClockSample;
  identifier():string;
}
/** Scheduler-independent coordinator. Hosts feed monotonic ticks and lifecycle
 * events (T061). No account credential or mutation transport is accepted here. */
export class TimeCheckCycle {
  private current=newTimeCheck();
  private ready=false;
  private tail:Promise<unknown>=Promise.resolve();
  private abort:AbortController|undefined;
  private epoch=0;
  private open=false;
  private online=false;
  private writer:TimeResultWriter|undefined;
  private unsaved:TimeCheckState|undefined;
  constructor(private readonly ports:TimeCyclePorts){}
  get state(){return structuredClone(this.current);}
  get storageBlocked(){return this.unsaved!==undefined||this.writer!==undefined;}
  private serial<T>(fn:()=>Promise<T>){const next=this.tail.catch(()=>undefined).then(fn);this.tail=next;return next;}
  idle(){return this.tail.catch(()=>undefined);}
  private async persist(next:TimeCheckState){
    this.unsaved=structuredClone(next);
    await this.ports.save(structuredClone(next));
    this.current=structuredClone(next);this.unsaved=undefined;
  }
  initialize(){return this.serial(async()=>{
    if(this.ready)return;
    const loaded=await this.ports.load(),resumed=resumeTimeCheck(loaded,this.ports.clock());
    await this.persist(resumed);this.ready=true;
  });}
  tick(input:{open:boolean;online:boolean}){
    this.open=input.open;this.online=input.online;
    return this.serial(async()=>{
      if(!this.ready)throw new Error('TIME_CYCLE_NOT_INITIALIZED');
      // A failed transition must become durable before any further query.
      if(this.unsaved){
        // A failed start-marker write never launched transport. Return to pending
        // without counting a remote failure before starting a fresh timed query.
        const retry=this.unsaved.phase==='querying'
          ? {phase:'pending' as const,failures:this.unsaved.failures,warning:this.unsaved.warning}
          : this.unsaved;
        await this.persist(retry);return;
      }
      if(this.writer){
        await this.writer.tick(this.open);this.current=this.writer.state;
        if(this.current.phase==='complete')this.writer=undefined;
        return;
      }
      if(this.current.phase==='pending'){
        const resumed=resumeTimeCheck(this.current,this.ports.clock());
        if(resumed!==this.current){await this.persist(resumed);return;}
      }
      const checked=timeQueryTick(this.current,this.ports.clock());
      if(checked!==this.current){this.abort?.abort();this.epoch++;await this.persist(checked);return;}
      if(!this.open||!this.online)return;
      const id=this.ports.identifier(),nonce=this.ports.identifier();
      const next=beginTimeQuery(this.current,this.ports.clock(),{...input,id,nonce});
      if(next===this.current)return;
      const epoch=this.epoch;
      await this.persist(next);
      if(epoch!==this.epoch)return; // close/disconnect arrived during persistence
      const abort=new AbortController();this.abort=abort;
      void Promise.resolve().then(()=>this.ports.query(nonce,abort.signal)).then(
        response=>this.serial(async()=>{
          if(epoch!==this.epoch)return;
          const received=receiveTimeQuery(this.current,id,response,this.ports.clock());
          if(received.phase==='save_pending'){
            this.current=received;
            this.writer=new TimeResultWriter(received,value=>this.ports.save(value),()=>this.ports.clock());
            await this.writer.tick(this.open);this.current=this.writer.state;
            if(this.current.phase==='complete')this.writer=undefined;
          }else if(received!==this.current)await this.persist(received);
        }),
        ()=>this.serial(async()=>{
          if(epoch!==this.epoch)return;
          const failed=interruptTimeQuery(this.current,this.ports.clock(),'failure');
          if(failed!==this.current)await this.persist(failed);
        }),
      ).catch(()=>{ /* unsaved transition remains blocked until persistence succeeds */ });
    });
  }
  interrupt(reason:'close'|'disconnect'|'suspend'){
    // Invalidate replies immediately, even if a previous storage write is slow.
    this.epoch++;this.abort?.abort();if(reason==='close'||reason==='suspend')this.open=false;
    if(reason==='disconnect')this.online=false;
    const detected=this.ports.clock();
    return this.serial(async()=>{
      const state=this.unsaved??this.current;
      const next=interruptTimeQuery(state,detected,reason);
      if(next!==state)await this.persist(next);
    });
  }
  assess(deadline:number){return this.serial(async()=>{
    if(!this.ready||this.unsaved||this.writer)return 'uncertain' as const;
    const assessed=checkStoredTime(this.current,deadline,this.ports.clock());
    if(assessed.state!==this.current)await this.persist(assessed.state);
    return assessed.retention;
  });}
}
