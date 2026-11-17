/** Backup and restore copies share one inventory. A test restore is still a
 * recoverable copy until its destruction has been positively confirmed. */
export interface RecoverableCopy {
 id:string;
 kind:'backup'|'restore'|'temporary';
 capturedAt:number;
 watermark:{sequence:number;hash:string|null};
 state:'recoverable'|'deleting'|'deleted';
}
export const BACKUP_RETENTION_MS=7*86400000;
function valid(copy:RecoverableCopy){
 if(!copy.id||!['backup','restore','temporary'].includes(copy.kind)||!['recoverable','deleting','deleted'].includes(copy.state)||!Number.isSafeInteger(copy.capturedAt)||copy.capturedAt<0||!Number.isSafeInteger(copy.watermark.sequence)||copy.watermark.sequence<0||(copy.watermark.sequence===0?copy.watermark.hash!==null:typeof copy.watermark.hash!=='string'||!/^[a-f0-9]{64}$/.test(copy.watermark.hash)))throw Error('BACKUP_INVENTORY_INVALID');
}
export function validateCopyInventory(copies:readonly RecoverableCopy[]){
 const ids=new Set<string>();for(const copy of copies){valid(copy);if(ids.has(copy.id))throw Error('BACKUP_INVENTORY_INVALID');ids.add(copy.id);}
 return structuredClone(copies);
}
/** Expiration schedules deletion; it is never proof that a copy disappeared.
 * Consequently a failed or interrupted cleanup retains suppression evidence. */
export function expiredCopies(copies:readonly RecoverableCopy[],now:number){
 if(!Number.isSafeInteger(now)||now<0)throw Error('BACKUP_CLOCK_INVALID');
 return validateCopyInventory(copies).filter(c=>c.state!=='deleted'&&now-c.capturedAt>=BACKUP_RETENTION_MS);
}
export function suppressionStillNeeded(copies:readonly RecoverableCopy[],confirmationSequence:number){
 if(!Number.isSafeInteger(confirmationSequence)||confirmationSequence<1)throw Error('SUPPRESSION_SEQUENCE_INVALID');
 return validateCopyInventory(copies).some(c=>c.state!=='deleted'&&c.watermark.sequence<confirmationSequence);
}
export function registerRestoreCopy(copies:readonly RecoverableCopy[],sourceId:string,id:string,kind:'restore'|'temporary'){
 const inventory=validateCopyInventory(copies),source=inventory.find(c=>c.id===sourceId&&c.state==='recoverable');
 if(!source||inventory.some(c=>c.id===id))throw Error('BACKUP_SOURCE_UNAVAILABLE');
 // Copying cannot extend the approved lifetime or reset the watermark.
 const copy:RecoverableCopy={...source,id,kind,state:'recoverable',watermark:{...source.watermark}};
 valid(copy);return [...inventory,copy];
}
