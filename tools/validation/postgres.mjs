import { spawnSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';

const name = `patron-foundation-${randomUUID()}`;
const password = randomBytes(32).toString('hex');
function docker(args, options = {}) {
  const result = spawnSync('docker', args, { encoding: 'utf8', timeout: 300000, ...options });
  if (result.error || result.status !== 0) throw new Error(result.error?.message ?? result.stderr.trim());
  return result.stdout.trim();
}
let created = false;
try {
  docker(['version', '--format', '{{.Server.Version}}'], { timeout: 15000 });
  console.log('Creando PostgreSQL 18.7 efímero en 127.0.0.1, sin volúmenes del usuario.');
  docker(['run', '--detach', '--name', name, '--label', 'patronaje.purpose=foundation-test',
    '--publish', '127.0.0.1::5432', '--env', 'POSTGRES_PASSWORD', '--env', 'POSTGRES_DB=patron_foundation_test',
    '--tmpfs', '/var/lib/postgresql:rw', 'postgres:18.7'], { env: { ...process.env, POSTGRES_PASSWORD: password } });
  created = true;
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    const probe = spawnSync('docker', ['exec', name, 'pg_isready', '-U', 'postgres', '-d', 'patron_foundation_test'], { timeout: 5000 });
    if (probe.status === 0) { ready = true; break; }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  if (!ready) throw new Error('PostgreSQL de ensayo no quedó disponible.');
  const port = docker(['port', name, '5432/tcp']).match(/^127\.0\.0\.1:(\d+)$/)?.[1];
  if (!port) throw new Error('Puerto de ensayo no local.');
  const args = process.argv.slice(2), e2e = args[0] === '--e2e';
  const result = spawnSync(process.execPath, ['tools/validation/run.mjs', e2e ? 'e2e' : 'integration', ...(e2e ? args.slice(1) : args)], {
    stdio: 'inherit', env: { ...process.env, PATRON_TEST_DATABASE_URL: `postgresql://postgres:${password}@127.0.0.1:${port}/patron_foundation_test` },
  });
  process.exitCode = result.status ?? 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Falló el entorno local.');
  process.exitCode = 1;
} finally {
  if (created) {
    try { docker(['rm', '--force', name]); console.log('Contenedor de ensayo retirado.'); }
    catch { console.error(`No se pudo retirar el contenedor de ensayo ${name}.`); process.exitCode = 1; }
  }
}
