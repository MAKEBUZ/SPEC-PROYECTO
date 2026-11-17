import {expect,it} from 'vitest';
import {BACKUP_RETENTION_MS,expiredCopies,registerRestoreCopy,suppressionStillNeeded,type RecoverableCopy} from '../../apps/api/src/storage/backup-policy.js';
const backup=():RecoverableCopy=>({id:'backup',kind:'backup',capturedAt:1000,watermark:{sequence:2,hash:'a'.repeat(64)},state:'recoverable'});
it('T087 retains evidence while any preceding backup, restored copy or temporary remains recoverable',()=>{
 const original=backup(),copies=registerRestoreCopy(registerRestoreCopy([original],'backup','restore','restore'),'backup','temporary','temporary');
 for(const kind of ['backup','restore','temporary']){
  const inventory=copies.map(c=>({...c,state:c.kind===kind?'recoverable' as const:'deleted' as const}));
  expect(suppressionStillNeeded(inventory,3)).toBe(true);
 }
 expect(suppressionStillNeeded(copies.map(c=>({...c,state:'deleted'})),3)).toBe(false);
 expect(suppressionStillNeeded([original],2)).toBe(false);
 expect(suppressionStillNeeded([original],1)).toBe(false);
});
it('T091 expires inclusively after seven days without extending the lifetime of restore copies',()=>{
 const inventory=registerRestoreCopy([backup()],'backup','restore','restore');
 expect(expiredCopies(inventory,1000+BACKUP_RETENTION_MS-1)).toEqual([]);
 expect(expiredCopies(inventory,1000+BACKUP_RETENTION_MS).map(c=>c.id)).toEqual(['backup','restore']);
 expect(inventory[1]!.capturedAt).toBe(inventory[0]!.capturedAt);
 expect(inventory[1]!.watermark).toEqual(inventory[0]!.watermark);
});
it('T087 expiration and a failed deletion never authorize removal of suppression evidence',()=>{
 const copy={...backup(),state:'deleting' as const};
 expect(expiredCopies([copy],1000+BACKUP_RETENTION_MS*2)).toEqual([copy]);
 expect(suppressionStillNeeded([copy],3)).toBe(true);
 expect(suppressionStillNeeded([{...copy,state:'deleted'}],3)).toBe(false);
});
it('T091 rejects damaged or ambiguous inventory instead of inferring that no backup remains',()=>{
 expect(()=>suppressionStillNeeded([backup(),backup()],3)).toThrow('BACKUP_INVENTORY_INVALID');
 expect(()=>suppressionStillNeeded([{...backup(),watermark:{sequence:1,hash:null}}],3)).toThrow('BACKUP_INVENTORY_INVALID');
 expect(()=>expiredCopies([backup()],NaN)).toThrow('BACKUP_CLOCK_INVALID');
 expect(()=>registerRestoreCopy([{...backup(),state:'deleting'}],'backup','restore','restore')).toThrow('BACKUP_SOURCE_UNAVAILABLE');
 expect(()=>registerRestoreCopy([backup()],'backup','backup','restore')).toThrow('BACKUP_SOURCE_UNAVAILABLE');
});
