import {createHash} from 'node:crypto';
import {BACKUP_RETENTION_MS} from './backup-policy.js';
import {suppressionPlan,type SuppressionRecord,type SuppressionScope} from './suppression-log.js';
import {keys,object} from '../../../../packages/contracts/src/validation.js';
export interface BackupObject {key:string;sha256:string;bytes:number}
export interface BackupCapture {
 schema:string;engine:string;capturedAt:number;dump:Uint8Array;roles:Uint8Array;
 objects:BackupObject[];watermark:{sequence:number;hash:string|null};
}
export interface BackupManifest {
 backupId:string;schema:string;engine:string;capturedAt:number;expiresAt:number;
 dumpHash:string;rolesHash:string;objects:BackupObject[];watermark:{sequence:number;hash:string|null};
}
export interface BackupArtifact {manifest:BackupManifest;dump:Uint8Array;roles:Uint8Array}
const digest=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const hex=(value:string)=>/^[a-f0-9]{64}$/.test(value);
export function validateBackup(artifact:BackupArtifact){
 keys(object(artifact),['manifest','dump','roles']);
 const m=artifact.manifest;
 keys(object(m),['backupId','schema','engine','capturedAt','expiresAt','dumpHash','rolesHash','objects','watermark']);
 keys(object(m.watermark),['sequence','hash']);
 if(![m.backupId,m.schema,m.engine].every(v=>typeof v==='string'&&v.length>0)||!Number.isSafeInteger(m.capturedAt)||m.capturedAt<0||m.expiresAt!==m.capturedAt+BACKUP_RETENTION_MS||!Number.isSafeInteger(m.expiresAt)||!(artifact.dump instanceof Uint8Array)||!artifact.dump.length||!(artifact.roles instanceof Uint8Array)||!artifact.roles.length||digest(artifact.dump)!==m.dumpHash||digest(artifact.roles)!==m.rolesHash||!Array.isArray(m.objects)||!Number.isSafeInteger(m.watermark.sequence)||m.watermark.sequence<0||(m.watermark.sequence===0?m.watermark.hash!==null:typeof m.watermark.hash!=='string'||!hex(m.watermark.hash)))throw Error('BACKUP_INVALID');
 const seen=new Set<string>();for(const blob of m.objects){keys(object(blob),['key','sha256','bytes']);if(typeof blob.key!=='string'||typeof blob.sha256!=='string'||!hex(blob.key)||!hex(blob.sha256)||!Number.isSafeInteger(blob.bytes)||blob.bytes<0||seen.has(blob.key))throw Error('BACKUP_INVALID');seen.add(blob.key);}
 return structuredClone(artifact);
}
export interface BackupPorts {
 /** Must exclude ALL writers, including blob deletion and workers outside SQL
  * transactions. Resolves only when already admitted work has drained. */
 drain():Promise<{release():Promise<void>}>;
 capture():Promise<BackupCapture>;
 /** Create exclusively outside the running host; return a fresh readback. */
 store(artifact:BackupArtifact):Promise<BackupArtifact>;
 /** Registration follows verified readback, never just a successful upload. */
 register(manifest:BackupManifest):Promise<void>;
 shutdown():Promise<void>;
}
/** Transport-independent protocol; no AWS or OS shutdown implementation. A
 * pre-shutdown failure always releases maintenance and never calls shutdown. */
export async function runBackup(ports:BackupPorts,id:string,reason:'daily'|'shutdown'){
 if(!id||!['daily','shutdown'].includes(reason))throw Error('BACKUP_INPUT_INVALID');
 const lease=await ports.drain();
 let shutdownAccepted=false;
 try{
  const capture=await ports.capture();
  const artifact=validateBackup({manifest:{backupId:id,schema:capture.schema,engine:capture.engine,capturedAt:capture.capturedAt,expiresAt:capture.capturedAt+BACKUP_RETENTION_MS,dumpHash:digest(capture.dump),rolesHash:digest(capture.roles),objects:capture.objects,watermark:capture.watermark},dump:capture.dump,roles:capture.roles});
  const stored=validateBackup(await ports.store(structuredClone(artifact)));
  if(JSON.stringify(stored.manifest)!==JSON.stringify(artifact.manifest))throw Error('BACKUP_READBACK_MISMATCH');
  await ports.register(structuredClone(artifact.manifest));
  if(reason==='shutdown'){await ports.shutdown();shutdownAccepted=true;}
  return artifact.manifest;
 }finally{if(!shutdownAccepted)await lease.release();}
}
export interface RestorePorts {
 isolate():Promise<{traffic:boolean;jobs:boolean;mail:boolean}>;
 evidence():Promise<SuppressionRecord[]>;
 restore(artifact:BackupArtifact):Promise<void>;
 suppress(scopes:SuppressionScope[]):Promise<void>;
 verifyObject(object:BackupObject):Promise<void>;
 /** A readiness receipt only: must not open traffic or launch jobs/mail. */
 seal(manifest:BackupManifest):Promise<void>;
}
export async function runIsolatedRestore(ports:RestorePorts,input:BackupArtifact,now:number){
 const isolation=await ports.isolate();
 if(isolation.traffic!==false||isolation.jobs!==false||isolation.mail!==false)throw Error('RESTORE_NOT_ISOLATED');
 const artifact=validateBackup(input);
 if(!Number.isSafeInteger(now)||now<artifact.manifest.capturedAt||now>=artifact.manifest.expiresAt)throw Error('BACKUP_NOT_RECOVERABLE');
 const records=await ports.evidence(),scopes=suppressionPlan(records,artifact.manifest.watermark);
 await ports.restore(structuredClone(artifact));
 await ports.suppress(scopes);
 const removed=new Set(scopes.flatMap(s=>s.objectKeys));
 for(const object of artifact.manifest.objects)if(!removed.has(object.key))await ports.verifyObject({...object});
 // Never seal against a stale evidence snapshot. A retry stays isolated.
 const current=await ports.evidence();suppressionPlan(current,artifact.manifest.watermark);
 if(JSON.stringify(current)!==JSON.stringify(records))throw Error('SUPPRESSION_CHANGED');
 await ports.seal(structuredClone(artifact.manifest));
 return {state:'isolated-ready' as const,backupId:artifact.manifest.backupId};
}
