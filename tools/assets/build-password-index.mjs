import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
const build = spawnSync(process.execPath, ['node_modules/typescript/bin/tsc', '--noEmit', 'false', '--outDir', 'dist', '--rootDir', '.'], { stdio: 'inherit' });
if (build.status !== 0) process.exit(build.status ?? 1);
const { buildPasswordIndex } = await import('../../dist/apps/api/src/auth/password-index.js');
const assets = JSON.parse(readFileSync('tools/assets/manifest.json', 'utf8')).assets;
const source = assets.find(asset => asset.path === '.local/assets/passwords.txt');
const license = assets.find(asset => asset.path === '.local/assets/passwords-LICENSE');
const licenseBytes = readFileSync(license.path);
if (createHash('sha256').update(licenseBytes).digest('hex') !== license.sha256) throw new Error('Licencia del corpus alterada.');
const path = 'tools/assets/password-index.json';
const approved = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : undefined;
const start = performance.now();
console.log('Construyendo índice completo del corpus aprobado; no se publicará hasta verificarlo.');
const result = await buildPasswordIndex({ source: source.path, outputDirectory: '.local/password-index',
  sourceApproval: { sha256: source.sha256, bytes: source.bytes, entries: 5189454, revision: '51aa7644c96b3fb6db8de9ecf55aa91195209c80', license: 'MIT' },
  ...(approved ? { indexApproval: approved } : {}), licenseText: licenseBytes.toString('utf8'),
});
if (!approved) writeFileSync(path, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ entries: result.entries, bytes: result.bytes, sha256: result.sha256, elapsedSeconds: (performance.now() - start) / 1000, maximumRssKiB: process.resourceUsage().maxRSS }));
