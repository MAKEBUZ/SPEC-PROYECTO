import {it,expect} from 'vitest';
import {createHash,randomUUID} from 'node:crypto';
import {runBackup,runIsolatedRestore,type BackupArtifact,type BackupPorts,type RestorePorts} from '../../apps/api/src/storage/backup-coordinator.js';
import {canonicalize} from '../../packages/document/src/revision.js';
import type {SuppressionEvent,SuppressionRecord} from '../../apps/api/src/storage/suppression-log.js';
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
function fixture(fail=''){
 const events:string[]=[],objects=[{key:'a'.repeat(64),sha256:hash('active'),bytes:6},{key:'b'.repeat(64),sha256:hash('removed'),bytes:7}];let stored:BackupArtifact|undefined;
 const step=(name:string)=>{events.push(name);if(name===fail)throw Error('injected '+name);};
 const ports:BackupPorts={drain:async()=>{step('drain');return {release:async()=>step('release')};},capture:async()=>{step('capture');return {schema:'009',engine:'18.7',capturedAt:1000,dump:Buffer.from('dump'),roles:Buffer.from('roles'),objects,watermark:{sequence:0,hash:null}};},store:async a=>{step('store');stored=structuredClone(a);if(fail==='corrupt')stored.dump[0]=0;return stored;},register:async()=>step('register'),shutdown:async()=>step('shutdown')};
 return {ports,events,get artifact(){return stored!;}};
}
function evidence():SuppressionRecord[]{
 const intent:SuppressionEvent={kind:'intent',id:randomUUID(),scope:{kind:'pattern',resourceIds:[randomUUID()],objectKeys:['b'.repeat(64)]}},confirm:SuppressionEvent={kind:'confirmed',id:randomUUID(),intentId:intent.id};
 const rows:SuppressionRecord[]=[];for(const event of [intent,confirm]){const content={sequence:rows.length+1,previous:rows.at(-1)?.hash??null,event};rows.push({...content,hash:hash(canonicalize(content))});}return rows;
}
it.each(['daily','shutdown'] as const)('T091 drains, validates readback and registers before %s completion',async reason=>{
 const f=fixture();const result=await runBackup(f.ports,'backup-1',reason);
 expect(f.events).toEqual(['drain','capture','store','register',...(reason==='shutdown'?['shutdown']:['release'])]);
 expect(result.expiresAt-result.capturedAt).toBe(7*86400000);expect(result.rolesHash).toBe(hash('roles'));
});
it.each(['capture','store','register','corrupt'])('T091 %s failure cancels shutdown and exits maintenance',async fault=>{
 const f=fixture(fault);await expect(runBackup(f.ports,'backup-1','shutdown')).rejects.toThrow();
 expect(f.events).not.toContain('shutdown');expect(f.events.at(-1)).toBe('release');
 if(fault==='corrupt')expect(f.events).not.toContain('register');
});
it('T091 never captures while drain fails',async()=>{
 const f=fixture('drain');await expect(runBackup(f.ports,'backup-1','shutdown')).rejects.toThrow();expect(f.events).toEqual(['drain']);
});
it.each(['valid','incomplete','missing-active','changed-evidence','expired','corrupt-dump','not-isolated'])('T092 isolated restoration: %s',async mode=>{
 const f=fixture();await runBackup(f.ports,'backup-1','daily');const artifact=structuredClone(f.artifact),events:string[]=[],records=evidence();let reads=0;
 if(mode==='corrupt-dump')artifact.dump[0]=0;
 const ports:RestorePorts={
  isolate:async()=>{events.push('isolate');return {traffic:mode==='not-isolated',jobs:false,mail:false};},
  evidence:async()=>{reads++;if(mode==='incomplete')return records.slice(0,1);if(mode==='changed-evidence'&&reads===2)return [...records,...[]].map((r,i)=>i===1?{...r,hash:'f'.repeat(64)}:r);return structuredClone(records);},
  restore:async()=>{events.push('restore');},suppress:async scopes=>{events.push('suppress');expect(scopes).toEqual([records[0]!.event.kind==='intent'?records[0]!.event.scope:null]);},
  verifyObject:async o=>{events.push('verify:'+o.key);if(mode==='missing-active')throw Error('missing');},seal:async()=>{events.push('seal');},
 };
 const result=runIsolatedRestore(ports,artifact,mode==='expired'?artifact.manifest.expiresAt:1001);
 if(mode==='valid'){await expect(result).resolves.toEqual({state:'isolated-ready',backupId:'backup-1'});expect(events).toEqual(['isolate','restore','suppress','verify:'+'a'.repeat(64),'seal']);}
 else{await expect(result).rejects.toThrow();expect(events).not.toContain('seal');if(['incomplete','expired','corrupt-dump','not-isolated'].includes(mode))expect(events).not.toContain('restore');}
});
