import {mkdir,open,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {uuid} from '../../../../packages/contracts/src/validation.js';
import {validateBackup,type BackupArtifact,type BackupManifest} from './backup-coordinator.js';
/** Local transport for backup validation. The destination is operator-owned,
 * never a path supplied by an API caller. No AWS client or recursive removal. */
export class LocalBackupStore {
 constructor(private readonly directory:string){}
 private path(id:string){uuid(id);return join(this.directory,id);}
 private async write(path:string,bytes:Uint8Array){
  const file=await open(path,'wx',0o600);
  try{await file.writeFile(bytes);await file.sync();}finally{await file.close();}
 }
 async store(input:BackupArtifact){
  const artifact=validateBackup(input),path=this.path(artifact.manifest.backupId);
  await mkdir(this.directory,{recursive:true,mode:0o700});
  // Exclusive directory creation also preserves a failed attempt for diagnosis;
  // a later attempt requires a new ID, never overwrites the last good copy.
  await mkdir(path,{mode:0o700});
  await this.write(join(path,'database.dump'),artifact.dump);
  await this.write(join(path,'roles.sql'),artifact.roles);
  await this.write(join(path,'manifest.json'),Buffer.from(JSON.stringify(artifact.manifest)));
  return this.read(artifact.manifest.backupId);
 }
 async read(id:string){
  const path=this.path(id),manifest=JSON.parse(await readFile(join(path,'manifest.json'),'utf8')) as BackupManifest;
  if(manifest.backupId!==id)throw Error('BACKUP_ID_MISMATCH');
  return validateBackup({manifest,dump:await readFile(join(path,'database.dump')),roles:await readFile(join(path,'roles.sql'))});
 }
}
