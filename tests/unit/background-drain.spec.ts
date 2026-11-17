import {it,expect} from 'vitest';
import {PublicationJobs} from '../../apps/api/src/publications/publication-jobs.js';
import {PurgeJobs} from '../../apps/api/src/trash/purge.service.js';
import {AccountPurgeJobs} from '../../apps/api/src/account/account-purge.worker.js';
it.each(['publication','resource-purge','account-purge'] as const)('T091 drains %s and never admits a late run after destruction',async kind=>{
 let release!:()=>void,starts=0,queries=0,finished=false;
 const wait=new Promise<void>(r=>{release=r;});
 const admitted=async()=>{starts++;await wait;};
 const pool={query:async()=>{queries++;return {rows:[]};}};
 const jobs=kind==='publication'
  ?new PublicationJobs({dispatchPending:admitted} as ConstructorParameters<typeof PublicationJobs>[0],{finishReady:async()=>{queries++;}} as ConstructorParameters<typeof PublicationJobs>[1],{cleanAbandoned:async()=>{queries++;}} as ConstructorParameters<typeof PublicationJobs>[2])
  :kind==='resource-purge'
   ?new PurgeJobs(pool as unknown as ConstructorParameters<typeof PurgeJobs>[0],{reconcile:async()=>{queries++;return [];}} as unknown as ConstructorParameters<typeof PurgeJobs>[1],{queueExpired:admitted} as ConstructorParameters<typeof PurgeJobs>[2])
   :new AccountPurgeJobs(pool as unknown as ConstructorParameters<typeof AccountPurgeJobs>[0],{runDue:admitted} as ConstructorParameters<typeof AccountPurgeJobs>[1],{reconcile:async()=>{queries++;return [];}} as unknown as ConstructorParameters<typeof AccountPurgeJobs>[2]);
 const running=jobs.run();expect(starts).toBe(1);
 const draining=jobs.onModuleDestroy().then(()=>{finished=true;});await Promise.resolve();expect(finished).toBe(false);
 const late=jobs.run();expect(starts).toBe(1);release();await Promise.all([running,draining,late]);expect(finished).toBe(true);
 const before=queries;await jobs.run();await jobs.onModuleDestroy();expect(starts).toBe(1);expect(queries).toBe(before);
});
