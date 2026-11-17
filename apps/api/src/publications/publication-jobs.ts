import { ArtifactWorker } from './artifact-worker.js';
import { CommitService } from './commit.service.js';
import { StagingService } from './staging.service.js';
export class PublicationJobs {
  private stopped=false;
  private running:Promise<void>|undefined;private timer:ReturnType<typeof setInterval>|undefined;
  constructor(private readonly artifacts:ArtifactWorker,private readonly commits:CommitService,private readonly staging:StagingService){}
  run(){if(this.stopped)return this.running??Promise.resolve();if(this.running)return this.running;const next=(async()=>{await this.artifacts.dispatchPending();await this.commits.finishReady();await this.staging.cleanAbandoned();})();this.running=next;void next.finally(()=>{if(this.running===next)this.running=undefined;}).catch(()=>undefined);return next;}
  onModuleInit(){this.timer=setInterval(()=>{void this.run().catch(()=>undefined);},30000);this.timer.unref();void this.run().catch(()=>undefined);}
  async onModuleDestroy(){this.stopped=true;if(this.timer)clearInterval(this.timer);await this.running?.catch(()=>undefined);}
}
