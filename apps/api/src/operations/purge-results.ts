import type { PoolClient } from 'pg';
import { uuid } from '../../../../packages/contracts/src/validation.js';
import { HTTP_ERRORS } from '../../../../packages/contracts/src/http.js';

/** Internal purge step, in the same transaction that removes the account.
 * Historical UUIDs are never reassigned. The surviving account keeps only
 * result evidence, not response payloads, credentials or deleted content. */
export async function purgeAccountResults(client:PoolClient,accountId:string){
  uuid(accountId);
  if((await client.query('SELECT id FROM accounts WHERE id=$1',[accountId])).rowCount)throw Error('ACCOUNT_NOT_PURGED');
  // Serialize against removal of the other historical identity. A concurrent
  // account purge may deadlock and roll back for retry; it must not leave an
  // orphan result through a stale "another account still exists" snapshot.
  await client.query(`SELECT a.id FROM accounts a WHERE EXISTS(
    SELECT 1 FROM operation_results o WHERE (o.requester_id=$1 OR o.historical_owner_id=$1)
    AND (a.id=o.requester_id OR a.id=o.historical_owner_id)) ORDER BY a.id FOR UPDATE`,[accountId]);
  await client.query(`DELETE FROM operation_results o
    WHERE (o.requester_id=$1 OR o.historical_owner_id=$1)
      AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.id=o.requester_id OR a.id=o.historical_owner_id)`,[accountId]);
  await client.query(`UPDATE operation_results o SET data=(
    SELECT COALESCE(jsonb_object_agg(e.key,e.value),'{}'::jsonb)
    FROM jsonb_each(COALESCE(o.data,'{}'::jsonb)) e
    WHERE jsonb_typeof(e.value)='string' AND (
      (e.key='code' AND e.value #>> '{}' = ANY($2::text[])) OR
      (e.key IN ('id','projectId','patternId','versionId') AND e.value #>> '{}' ~ '^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$')
    )
  ) WHERE o.requester_id=$1 OR o.historical_owner_id=$1`,[accountId,Object.keys(HTTP_ERRORS)]);
}
