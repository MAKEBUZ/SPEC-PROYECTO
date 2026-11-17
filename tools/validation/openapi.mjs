import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
const build = spawnSync(process.execPath, ['node_modules/typescript/bin/tsc', '--noEmit', 'false', '--outDir', 'dist', '--rootDir', '.'], { stdio: 'inherit' });
if (build.status !== 0) process.exit(build.status ?? 1);
const { openApiDocument } = await import('../../dist/packages/contracts/src/openapi.js');
const content = JSON.stringify(openApiDocument(), null, 2) + '\n';
const path = 'docs/api/openapi.json';
if (process.argv.includes('--check')) {
  if (readFileSync(path, 'utf8') !== content) throw new Error('OpenAPI desactualizado; ejecutar npm run contracts:generate.');
} else {
  mkdirSync('docs/api', { recursive: true });
  writeFileSync(path, content);
}
console.log('OpenAPI verificado desde DTO y registro de rutas.');
