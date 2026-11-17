import type {Pool} from 'pg';
import {inTransaction} from '../db/transaction.js';
import {purgeAccountResults} from '../operations/purge-results.js';
import type {SuppressionScope} from './suppression-log.js';
import {uuid} from '../../../../packages/contracts/src/validation.js';
/** Only for an isolated restored database. Never delete source blobs: already
 * confirmed physical deletions are represented by the external journal. */
export async function applyRestoredSuppressions(pool:Pool,scopes:readonly SuppressionScope[]){
 await inTransaction(pool,async c=>{
  for(const scope of scopes){
   if(!['account','project','pattern'].includes(scope.kind)||!scope.resourceIds.length)throw Error('SUPPRESSION_INVALID');scope.resourceIds.forEach(uuid);
   const accounts=scope.kind==='account'?(await c.query<{id:string}>('SELECT id FROM accounts WHERE id=ANY($1::uuid[])',[scope.resourceIds])).rows.map(r=>r.id):[];
   const projects=(await c.query<{id:string}>('SELECT id FROM projects WHERE '+(scope.kind==='pattern'?'false':'id=ANY($1::uuid[]) OR owner_id=ANY($2::uuid[])'),scope.kind==='pattern'?[]:[scope.resourceIds,accounts])).rows.map(r=>r.id);
   const patterns=(await c.query<{id:string}>('SELECT id FROM patterns WHERE id=ANY($1::uuid[]) OR project_id=ANY($2::uuid[]) OR owner_id=ANY($3::uuid[])',[scope.resourceIds,projects,accounts])).rows.map(r=>r.id);
   const publications=(await c.query<{id:string}>('SELECT id FROM publications WHERE pattern_id=ANY($1::uuid[]) OR project_id=ANY($2::uuid[]) OR owner_id=ANY($3::uuid[])',[patterns,projects,accounts])).rows.map(r=>r.id);
   await c.query('DELETE FROM stored_files WHERE version_id IN (SELECT id FROM versions WHERE pattern_id=ANY($1::uuid[]))',[patterns]);
   await c.query('DELETE FROM versions WHERE pattern_id=ANY($1::uuid[])',[patterns]);
   await c.query('DELETE FROM publication_files WHERE publication_id=ANY($1::uuid[])',[publications]);
   await c.query('DELETE FROM publications WHERE id=ANY($1::uuid[])',[publications]);
   await c.query('DELETE FROM patterns WHERE id=ANY($1::uuid[])',[patterns]);
   await c.query('DELETE FROM projects WHERE id=ANY($1::uuid[])',[projects]);
   await c.query('DELETE FROM trash_batches WHERE owner_id=ANY($1::uuid[]) OR root_id=ANY($2::uuid[])',[accounts,[...projects,...patterns]]);
   await c.query('DELETE FROM outbox_jobs WHERE account_id=ANY($1::uuid[])',[accounts]);
   await c.query('DELETE FROM one_use_tokens WHERE account_id=ANY($1::uuid[])',[accounts]);
   await c.query('DELETE FROM sessions WHERE account_id=ANY($1::uuid[])',[accounts]);
   await c.query('DELETE FROM accounts WHERE id=ANY($1::uuid[])',[accounts]);
   for(const id of scope.kind==='account'?scope.resourceIds:[])await purgeAccountResults(c,id);
  }
  await c.query(`UPDATE accounts a SET used_bytes=(SELECT COALESCE(sum(f.bytes),0) FROM stored_files f JOIN versions v ON v.id=f.version_id JOIN patterns p ON p.id=v.pattern_id WHERE p.owner_id=a.id),reserved_bytes=(SELECT COALESCE(sum(p.reservation_bytes),0) FROM publications p WHERE p.owner_id=a.id)`);
 });
 // A pre-deletion dump cannot invent the original 90-day terminal timestamp.
 // Keep the restored environment isolated until authoritative evidence exists.
 if((await pool.query("SELECT 1 FROM deletion_checks d WHERE state='pending' AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.id=d.account_id) LIMIT 1")).rowCount)throw Error('RESTORE_DELETION_CHECK_RECONCILIATION_REQUIRED');
}
