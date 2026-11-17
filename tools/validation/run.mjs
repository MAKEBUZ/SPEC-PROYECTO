import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const suite = process.argv[2];
const suites = new Set(['unit', 'contracts', 'integration', 'e2e', 'geometry', 'recovery', 'print', 'performance']);
if (!suites.has(suite) || !existsSync(`tests/${suite}`)) {
  console.error(`La suite ${suite ?? '(sin nombre)'} todavía no está implementada.`);
  process.exit(1);
}
const files = process.argv.slice(3);
if (files.some(file => !file.startsWith(`tests/${suite}/`) || file.includes('..') || !file.endsWith('.spec.ts') || !existsSync(file))) {
  throw new Error('El filtro debe identificar archivos existentes de la suite seleccionada.');
}
// Integration hosts share one local PostgreSQL instance. Bound concurrent
// hosts rather than extending test deadlines when the machine is saturated.
const workers = suite === 'integration' ? ['--maxWorkers=2'] : [];
const result = spawnSync(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', ...workers, ...(files.length ? files : [`tests/${suite}`])], {
  stdio: 'inherit', env: { ...process.env, APP_ENV: 'test' },
});
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
