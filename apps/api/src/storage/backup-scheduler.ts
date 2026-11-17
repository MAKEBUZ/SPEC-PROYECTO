import type {BackupManifest} from './backup-coordinator.js';
import type {BackupCatalog} from './backup-catalog.js';
export interface BackupSchedulePorts {
 now():number;catalog:Pick<BackupCatalog,'read'>;clean():Promise<void>;
 backup(reason:'daily'|'shutdown'):Promise<BackupManifest>;
 onNotice?:(message:string|null)=>void;
}
/** Poll while the process is running; no catch-up loop for powered-off days.
 * Success is recovered from the durable verified catalog, never from a timer. */
export class BackupScheduler {
 private timer:ReturnType<typeof setInterval>|undefined;private daily:Promise<void>|undefined;
 private shutdown:Promise<BackupManifest>|undefined;private stopped=false;
 notice:string|null=null;
 private report(message:string|null){if(this.notice!==message){this.notice=message;try{this.ports.onNotice?.(message);}catch{/* An observer cannot change backup/shutdown results. */}}}
 constructor(private readonly ports:BackupSchedulePorts){}
 start(keepAlive=false){if(this.timer)return;this.stopped=false;this.timer=setInterval(()=>{void this.tick().catch(()=>{});},60000);if(!keepAlive)this.timer.unref();void this.tick().catch(()=>{});}
 async stop(){this.stopped=true;if(this.timer)clearInterval(this.timer);this.timer=undefined;await this.daily?.catch(()=>{});}
 tick():Promise<void>{
  if(this.stopped||this.shutdown)return Promise.resolve();if(this.daily)return this.daily;
  const pending=(async()=>{
   try{
    await this.ports.clean();const copies=await this.ports.catalog.read(),latest=Math.max(0,...copies.filter(c=>c.kind==='backup'&&c.verified).map(c=>c.capturedAt));
    const now=this.ports.now();if(!Number.isSafeInteger(now)||now<latest)throw Error('BACKUP_CLOCK_UNCERTAIN');
    if(!latest||now-latest>=86400000)await this.ports.backup('daily');this.report(null);
   }catch(e){this.report('No se pudo completar el respaldo o su limpieza. Se reintentará; el apagado no está autorizado.');throw e;}
  })();this.daily=pending;void pending.finally(()=>{if(this.daily===pending)this.daily=undefined;}).catch(()=>{});return pending;
 }
 beforeShutdown():Promise<BackupManifest>{
  if(this.shutdown)return this.shutdown;
  const operation=(async()=>{await this.daily?.catch(()=>{});try{await this.ports.clean();const m=await this.ports.backup('shutdown');this.report(null);return m;}catch(e){this.report('Falló el respaldo previo al apagado. Se canceló el apagado; puedes reintentar.');throw e;}})();
  this.shutdown=operation;void operation.catch(()=>{if(this.shutdown===operation)this.shutdown=undefined;});return operation;
 }
}
