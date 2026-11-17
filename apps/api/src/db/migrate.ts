import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Pool } from 'pg';
import { inTransaction } from './transaction.js';

export async function migrate(pool: Pool, directory: string): Promise<void> {
  // A single transaction and advisory lock prevent concurrent migration runs.
  await inTransaction(pool, async (client) => {
    await client.query('SELECT pg_advisory_xact_lock($1)', [172901]);
    await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, sha256 text NOT NULL, applied_at timestamptz NOT NULL DEFAULT clock_timestamp())');
    const names = (await readdir(directory)).filter((name) => /^\d{3}-[a-z0-9-]+\.sql$/.test(name)).sort();
    const applied = await client.query<{ name: string; sha256: string }>('SELECT name, sha256 FROM schema_migrations ORDER BY name');
    if (applied.rows.some((row) => !names.includes(row.name))) throw new Error('Falta una migración aplicada.');
    for (const name of names) {
      const sql = await readFile(join(directory, name), 'utf8');
      const hash = createHash('sha256').update(sql).digest('hex');
      const previous = applied.rows.find((row) => row.name === name);
      if (previous) {
        if (previous.sha256 !== hash) throw new Error('Una migración aplicada fue modificada.');
        continue;
      }
      await client.query(sql); // Only repository-owned migrations, never client input.
      await client.query('INSERT INTO schema_migrations (name, sha256) VALUES ($1, $2)', [name, hash]);
    }
  });
}
