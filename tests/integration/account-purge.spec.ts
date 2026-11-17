import {beforeAll,afterAll,it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {mkdtemp,rm,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {startAccountHost,type AccountHost,terminal,DAY} from '../support/account-host.js';
import {publishedFixture} from '../support/publication-fixture.js';
import {LocalSuppressionLog} from '../../apps/api/src/storage/suppression-log.js';
let host:AccountHost,directory:string,journal:LocalSuppressionLog;
beforeAll(async()=>{directory=await mkdtemp(join(tmpdir(),'patron-account-purge-'));journal=new LocalSuppressionLog(join(directory,'external-log'));host=await startAccountHost(journal,true);},30000);
afterAll(async()=>{await host?.close();if(directory){if(!resolve(directory).startsWith(resolve(tmpdir(),'patron-account-purge-')))throw Error('Unsafe cleanup');await rm(directory,{recursive:true,force:true});}});
async function fixture(){
 const a=await host.verifiedAccount(),p=await publishedFixture(host,a.session,0,true);
 const keys=(await host.pool.query<{private_key:string}>('SELECT f.private_key FROM publication_files f JOIN publications p ON p.id=f.publication_id WHERE p.owner_id=$1',[a.accountId])).rows.map(f=>f.private_key);
 const reply=await host.deleteAccount(a.session),requestId=terminal(reply).requestId as string,credential=reply.headers.get('x-deletion-credential')!;
 return {a,p,keys,requestId,credential};
}
const status=(f:{requestId:string;credential:string})=>host.request('GET','/deletion-status/'+f.requestId,undefined,undefined,{Authorization:f.credential});
it('purges actual published PDF content and last-account results, keeps local CAD and confirms 90 immutable days',async()=>{
 const f=await fixture(),local=join(directory,'local-document.patron');await writeFile(local,f.p.editable);
 await host.finishAccountPurges();expect((await status(f)).body.state).toBe('pending');expect((await host.pool.query('SELECT id FROM purge_jobs WHERE owner_id=$1',[f.a.accountId])).rowCount).toBe(0);
 await host.pool.query("UPDATE accounts SET deletion_deadline=clock_timestamp()-interval '1 second' WHERE id=$1",[f.a.accountId]);
 await host.finishAccountPurges();
 const result=await status(f);expect(result.body.state).toBe('deleted');expect(Date.parse(result.body.checkExpiresAt as string)-Date.parse(result.body.confirmedAt as string)).toBe(90*DAY);
 expect((await host.pool.query('SELECT id FROM accounts WHERE id=$1',[f.a.accountId])).rowCount).toBe(0);
 expect((await host.pool.query('SELECT operation_id FROM operation_results WHERE requester_id=$1 OR historical_owner_id=$1',[f.a.accountId])).rowCount).toBe(0);
 for(const key of f.keys)await expect(host.blobs.get(key)).rejects.toMatchObject({code:'ENOENT'});
 expect(await readFile(local)).toEqual(f.p.editable);await host.finishAccountPurges();expect((await status(f)).body).toEqual(result.body);
 expect((await host.request('GET','/account/profile',undefined,undefined,{Authorization:f.credential})).status).toBe(401);
 const replacement=await host.register(f.a.email);expect(replacement.accountId).not.toBe(f.a.accountId);
 expect((await status(f)).body).toEqual(result.body);
 expect((await host.pool.query('SELECT id FROM projects WHERE owner_id=$1',[replacement.accountId])).rowCount).toBe(0);
},30000);
it('does not claim deletion on missing account while external confirmation fails; a restart finishes the same job',async()=>{
 const f=await fixture(),append=journal.append.bind(journal);await host.pool.query("UPDATE accounts SET deletion_deadline=clock_timestamp()-interval '1 second' WHERE id=$1",[f.a.accountId]);
 journal.append=async e=>{if(e.kind==='confirmed')throw Error('external journal unavailable');return append(e);};
 try{await host.finishAccountPurges();expect((await status(f)).body.state).toBe('pending');expect((await host.pool.query('SELECT id FROM accounts WHERE id=$1',[f.a.accountId])).rowCount).toBe(0);expect((await host.pool.query('SELECT state FROM purge_jobs WHERE owner_id=$1',[f.a.accountId])).rows[0].state).toBe('metadata');}
 finally{journal.append=append;}
 await host.finishAccountPurges();expect((await status(f)).body.state).toBe('deleted');
},30000);
it('recovery prevents purging and keeps only cancelled checking without reviving sessions',async()=>{
 const f=await fixture(),limited=await host.login(f.a.email);
 expect((await host.request('POST','/account/recovery',{operationId:randomUUID(),confirmationText:'Recuperar mi cuenta'},limited)).status).toBe(200);
 await host.finishAccountPurges();const result=await status(f);expect(result.body.state).toBe('cancelled');expect(Date.parse(result.body.checkExpiresAt as string)-Date.parse(result.body.confirmedAt as string)).toBe(90*DAY);
 for(const key of f.keys)expect((await host.blobs.get(key)).length).toBeGreaterThan(0);
 expect((await host.request('GET','/account/profile',undefined,limited)).status).toBe(401);expect((await status(f)).body).toEqual(result.body);
},30000);
