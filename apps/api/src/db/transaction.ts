import type { Pool, PoolClient } from 'pg';
import {maintenanceFor} from '../storage/maintenance-gate.js';

export async function inTransaction<T>(pool: Pick<Pool, 'connect'>, action: (client: PoolClient) => Promise<T>, onRolledBack?:()=>Promise<void>): Promise<T> {
 return maintenanceFor(pool).run(()=>transaction(pool,action,onRolledBack));
}
async function transaction<T>(pool:Pick<Pool,'connect'>,action:(client:PoolClient)=>Promise<T>,onRolledBack?:()=>Promise<void>):Promise<T>{
  const client = await pool.connect();
  let releaseError: Error | undefined;
  let commitStarted=false;
  try {
    await client.query('BEGIN');
    const value = await action(client);
    commitStarted=true;await client.query('COMMIT');
    return value;
  } catch (error) {
    try { await client.query('ROLLBACK');if(!commitStarted)await onRolledBack?.(); }
    catch (rollbackError) { releaseError = rollbackError instanceof Error ? rollbackError : new Error('Rollback failed'); }
    throw error;
  } finally {
    client.release(releaseError);
  }
}

// Every mutating service must take these locks in this order before its
// final authorization check. Identifiers are values, never interpolated SQL.
export async function lockAccountAndSession(client: PoolClient, accountId: string, sessionId: string): Promise<void> {
  await client.query('SELECT id FROM accounts WHERE id = $1 FOR UPDATE', [accountId]);
  await client.query('SELECT id FROM sessions WHERE id = $1 AND account_id = $2 FOR UPDATE', [sessionId, accountId]);
}
