import {newTimeCheck,validateStoredTimeCheck,type TimeCheckState} from '../../../../packages/document/src/operations/time-check.js';
import {journalHash} from '../../../../packages/document/src/operations/journal.js';
export class WebTimeStorage {
 private db:Promise<IDBDatabase>;
 constructor(){this.db=new Promise((resolve,reject)=>{const q=indexedDB.open('patron-time-check',1);q.onupgradeneeded=()=>q.result.createObjectStore('state');q.onerror=()=>reject(q.error);q.onsuccess=()=>resolve(q.result);});}
 async load(){const db=await this.db;const value=await new Promise<{payload:string;digest:string}|undefined>((resolve,reject)=>{const tx=db.transaction('state','readonly'),q=tx.objectStore('state').get('current');tx.oncomplete=()=>resolve(q.result);tx.onabort=()=>reject(tx.error);});if(!value)return newTimeCheck();if(await journalHash(value.payload)!==value.digest)throw Error('TIME_CHECK_DAMAGED');return validateStoredTimeCheck(JSON.parse(value.payload));}
 async save(state:TimeCheckState){const payload=JSON.stringify(validateStoredTimeCheck(state)),digest=await journalHash(payload),db=await this.db;await new Promise<void>((resolve,reject)=>{const tx=db.transaction('state','readwrite',{durability:'strict'});tx.objectStore('state').put({payload,digest},'current');tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error);});}
}
