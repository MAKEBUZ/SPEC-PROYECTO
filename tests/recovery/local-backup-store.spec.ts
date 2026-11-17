import {it,expect} from 'vitest';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {LocalBackupStore} from '../../apps/api/src/storage/local-backup-store.js';
import {BACKUP_RETENTION_MS} from '../../apps/api/src/storage/backup-policy.js';
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
it('writes and verifies immutable local dump, roles and manifest without overwriting a prior backup',async()=>{
 const root=await mkdtemp(join(tmpdir(),'patron-backup-'));
 try{
  const store=new LocalBackupStore(root),id=randomUUID(),artifact={manifest:{backupId:id,schema:'009',engine:'18.7',capturedAt:1,expiresAt:1+BACKUP_RETENTION_MS,dumpHash:hash('dump'),rolesHash:hash('roles'),objects:[],watermark:{sequence:0,hash:null}},dump:Buffer.from('dump'),roles:Buffer.from('roles')};
  const written=await store.store(artifact);expect(written.manifest).toEqual(artifact.manifest);
  expect(Buffer.from((await new LocalBackupStore(root).read(id)).dump).toString()).toBe('dump');
  await expect(store.store(artifact)).rejects.toThrow();
  expect(Buffer.from((await store.read(id)).roles).toString()).toBe('roles');
  await writeFile(join(root,id,'roles.sql'),'corrupt');await expect(store.read(id)).rejects.toThrow('BACKUP_INVALID');
  await expect(store.read('../outside')).rejects.toThrow();
 }finally{await rm(root,{recursive:true,force:true});}
});
