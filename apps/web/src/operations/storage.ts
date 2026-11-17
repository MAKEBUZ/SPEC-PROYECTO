import type {JournalStorage} from '../../../../packages/document/src/operations/journal.js';
import {journalHash,retiredGeneration} from '../../../../packages/document/src/operations/journal.js';
interface Copy {payload:string;digest:string}
/** IndexedDB transactions commit primary, recovery copy and deletion evidence together. */
export class WebJournalStorage implements JournalStorage {
 private database:Promise<IDBDatabase>;
 constructor(name='patron-operation-journal'){
  this.database=new Promise((resolve,reject)=>{const q=indexedDB.open(name,3);q.onupgradeneeded=()=>{for(const name of ['generations','retired','copies'])if(!q.result.objectStoreNames.contains(name))q.result.createObjectStore(name);};q.onsuccess=()=>{q.result.onversionchange=()=>q.result.close();resolve(q.result);};q.onerror=()=>reject(q.error);});
 }
 async keys(){const db=await this.database;return new Promise<string[]>((resolve,reject)=>{const tx=db.transaction(['generations','copies'],'readonly'),a=tx.objectStore('generations').getAllKeys(),b=tx.objectStore('copies').getAllKeys();tx.oncomplete=()=>resolve([...new Set([...a.result,...b.result])].filter((k):k is string=>typeof k==='string'));tx.onabort=()=>reject(tx.error);});}
 private async pair(key:string){const db=await this.database,digest=await journalHash(key);return new Promise<{retired:unknown;value:unknown;copy:Copy|undefined}>((resolve,reject)=>{const tx=db.transaction(['generations','retired','copies'],'readonly'),a=tx.objectStore('generations').get(key),b=tx.objectStore('retired').get(digest),c=tx.objectStore('copies').get(key);tx.oncomplete=()=>resolve({value:a.result,retired:b.result,copy:c.result});tx.onabort=()=>reject(tx.error);});}
 async read(key:string){
  const pair=await this.pair(key);if(pair.retired!==undefined){if(pair.retired!==true)throw Error('JOURNAL_DAMAGED');return [await retiredGeneration(key)];}
  let value=pair.value;
  if(pair.copy!==undefined){
   if(!pair.copy||typeof pair.copy!=='object'||!/^[a-f0-9]{64}$/.test(pair.copy.digest))throw Error('JOURNAL_DAMAGED');
   if(value===undefined||await journalHash(JSON.stringify(value))!==pair.copy.digest){
    if(typeof pair.copy.payload!=='string'||await journalHash(pair.copy.payload)!==pair.copy.digest)throw Error('JOURNAL_DAMAGED');value=JSON.parse(pair.copy.payload);
   }
  }
  if(value===undefined)return [];if(!Array.isArray(value)||value.some(v=>typeof v!=='string'))throw Error('JOURNAL_DAMAGED');return value as string[];
 }
 private matches(value:unknown,copy:Copy|undefined,expected:readonly string[],hash:string){
  const encoded=JSON.stringify(expected);return copy?copy.digest===hash&&(JSON.stringify(value)===encoded||copy.payload===encoded):JSON.stringify(value??[])===encoded;
 }
 async append(key:string,expected:readonly string[],encoded:string){
  const db=await this.database,digest=await journalHash(key),payload=JSON.stringify([...expected,encoded]),hash=await journalHash(JSON.stringify(expected)),copy={payload,digest:await journalHash(payload)};
  return new Promise<void>((resolve,reject)=>{const tx=db.transaction(['generations','retired','copies'],'readwrite',{durability:'strict'}),store=tx.objectStore('generations'),a=store.get(key),b=tx.objectStore('retired').get(digest),c=tx.objectStore('copies').get(key);let conflict=false;
   c.onsuccess=()=>{if(b.result!==undefined||!this.matches(a.result,c.result,expected,hash)){conflict=true;tx.abort();return;}store.put([...expected,encoded],key);tx.objectStore('copies').put(copy,key);};
   tx.oncomplete=()=>resolve();tx.onabort=()=>reject(Error(conflict?'JOURNAL_CONFLICT':'JOURNAL_SAVE_FAILED'));
  });
 }
 async compact(key:string){
  const db=await this.database,records=await this.read(key),last=records.at(-1);if(!last)throw Error('JOURNAL_COMPACTION_FORBIDDEN');
  const envelope=JSON.parse(last);if(await journalHash(envelope.payload)!==envelope.checksum||JSON.parse(envelope.payload).value!==null)throw Error('JOURNAL_COMPACTION_FORBIDDEN');
  const digest=await journalHash(key),hash=await journalHash(JSON.stringify(records));
  return new Promise<void>((resolve,reject)=>{const tx=db.transaction(['generations','retired','copies'],'readwrite',{durability:'strict'}),store=tx.objectStore('generations'),a=store.get(key),b=tx.objectStore('retired').get(digest),c=tx.objectStore('copies').get(key);let conflict=false;
   c.onsuccess=()=>{if(b.result!==undefined&&b.result!==true||b.result!==true&&!this.matches(a.result,c.result,records,hash)){conflict=true;tx.abort();return;}tx.objectStore('retired').put(true,digest);store.delete(key);tx.objectStore('copies').delete(key);};
   tx.oncomplete=()=>resolve();tx.onabort=()=>reject(Error(conflict?'JOURNAL_CONFLICT':'JOURNAL_SAVE_FAILED'));
  });
 }
 async close(){(await this.database).close();}
}
