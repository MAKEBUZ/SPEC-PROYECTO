import type { HttpDto } from '../../contracts/src/http-dto.js';
import {parseDeletionCheckBatch} from '../../contracts/src/deletion-check-batch.js';
export interface DeletionCheckPorts {
  query():Promise<unknown>;
  result(rows:HttpDto<'DeletionStatus'>[]):void;
  failure():void;
}
/** Shared by CAD, web and PWA account screens. This controller only queries the
 * restricted status capability; it has no deletion/recovery mutation or cleanup. */
export class DeletionCheckController {
  private running=false;
  private online=false;
  private failures=0;
  private generation=0;
  private timer:ReturnType<typeof setTimeout>|undefined;
  private inflight:Promise<void>|undefined;
  constructor(private readonly ports:DeletionCheckPorts){}
  start(online:boolean){this.running=true;this.online=online;void this.checkNow();}
  stop(){this.running=false;this.generation++;this.clearTimer();}
  connect(online:boolean){const recovered=online&&!this.online;if(!online&&this.online)this.generation++;this.online=online;if(!online)this.clearTimer();else if(recovered)void this.checkNow();}
  private clearTimer(){if(this.timer!==undefined){clearTimeout(this.timer);this.timer=undefined;}}
  checkNow():Promise<void>{
    if(!this.running||!this.online)return Promise.resolve();
    if(this.inflight)return this.inflight;
    this.clearTimer();const generation=this.generation;
    let query:Promise<unknown>;
    try{query=this.ports.query();}catch(error){query=Promise.reject(error);}
    this.inflight=query.then(value=>{
      if(!this.running||generation!==this.generation)return;
      const {rows,failed}=parseDeletionCheckBatch(value);
      this.ports.result(rows);
      if(failed)throw Error('DELETION_CHECK_PARTIAL');
      this.failures=0;
    }).catch(()=>{
      if(!this.running||generation!==this.generation)return;
      this.failures=Math.min(6,this.failures+1);this.ports.failure();
      if(this.online)this.timer=setTimeout(()=>{this.timer=undefined;void this.checkNow();},[5000,10000,20000,40000,80000,120000][this.failures-1]!);
    }).finally(()=>{
      this.inflight=undefined;
      if(this.running&&this.online&&generation!==this.generation)queueMicrotask(()=>{void this.checkNow();});
    });
    return this.inflight;
  }
}
