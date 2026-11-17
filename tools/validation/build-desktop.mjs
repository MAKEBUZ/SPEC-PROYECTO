import { mkdirSync, renameSync, copyFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { build } from 'vite';
import { resolve } from 'node:path';
function compile(args) {
  const result = spawnSync(process.execPath, ['node_modules/typescript/bin/tsc', ...args], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
compile(['--noEmit', 'false', '--outDir', 'dist', '--rootDir', '.']);
const base = 'dist/apps/desktop/src';
mkdirSync(base + '/renderer', { recursive: true });
mkdirSync(base + '/preload', { recursive: true });
compile(['--ignoreConfig', 'apps/desktop/src/preload/index.ts', '--module', 'commonjs', '--target', 'es2024', '--strict', '--skipLibCheck', '--types', 'node', '--outDir', base + '/preload']);
renameSync(base + '/preload/index.js', base + '/preload/index.cjs');
await build({ root: resolve('apps/desktop/src/renderer'), base: './', build: { outDir: resolve(base + '/renderer'), emptyOutDir: true }, });
