import {uuid} from '../../../../packages/contracts/src/validation.js';
import type {AccountHistory} from '../../../../packages/document/src/operations/closed.js';
import {encodeHistory,decodeHistory,assertHistoryProgress,RECOVERY_NOTICE,type HistorySnapshot} from '../../../../packages/document/src/operations/history-storage.js';

/** Two exact copies committed atomically; CAS prevents another tab replacing
 * evidence it has not read. No session or network is needed for maintenance. */
export class WebHistoryStorage {
 private db:Promise<IDBDatabase>;private isolated=false;
 constructor(private readonly accountId:string,name='patron-account-history'){
  uuid(accountId);this.db=new Promise((resolve,reject)=>{const q=indexedDB.open(name,1);q.onupgradeneeded=()=>q.result.createObjectStore('histories');q.onerror=()=>reject(q.error);q.onsuccess=()=>{q.result.onversionchange=()=>q.result.close();resolve(q.result);};});
 }
 get notice(){return this.isolated?RECOVERY_NOTICE:null;}
 async accounts(){const db=await this.db;return new Promise<string[]>((resolve,reject)=>{const tx=db.transaction('histories','readonly'),q=tx.objectStore('histories').getAllKeys();tx.oncomplete=()=>resolve(q.result.filter((k):k is string=>typeof k==='string'));tx.onabort=()=>reject(tx.error);});}
 private async read():Promise<HistorySnapshot|undefined>{const db=await this.db;return new Promise((resolve,reject)=>{const tx=db.transaction('histories','readonly'),q=tx.objectStore('histories').get(this.accountId);tx.oncomplete=()=>resolve(q.result);tx.onabort=()=>reject(tx.error);});}
 async load(){try{const raw=await this.read();if(!raw)throw Error('HISTORY_NOT_FOUND');const value=await decodeHistory(raw,this.accountId);this.isolated=false;return value;}catch(e){this.isolated=(e as Error).message!=='HISTORY_NOT_FOUND';throw e;}}
 async save(input:AccountHistory){
  const captured=structuredClone(input);if(captured.accountId!==this.accountId)throw Error('HISTORY_ROLLBACK');
  const snapshot=await encodeHistory(captured),expected=await this.read();
  let previous:AccountHistory|undefined;
  try{previous=expected?await decodeHistory(expected,this.accountId):undefined;}catch{this.isolated=true;throw Error('HISTORY_RECOVERY_UNAVAILABLE');}
  assertHistoryProgress(previous,captured);const db=await this.db;
  await new Promise<void>((resolve,reject)=>{const tx=db.transaction('histories','readwrite',{durability:'strict'}),store=tx.objectStore('histories'),q=store.get(this.accountId);let conflict=false;
   q.onsuccess=()=>{if(JSON.stringify(q.result)!==JSON.stringify(expected)){conflict=true;tx.abort();return;}store.put(snapshot,this.accountId);};
   tx.oncomplete=()=>resolve();tx.onabort=()=>reject(Error(conflict?'HISTORY_CONFLICT':'HISTORY_SAVE_FAILED'));
  });this.isolated=false;
 }
 async close(){(await this.db).close();}
}
