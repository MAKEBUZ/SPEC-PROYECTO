import assert from 'node:assert/strict';
import { createReadStream } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
if (process.argv.includes('--compile')) {
  const result = spawnSync(process.execPath, ['node_modules/typescript/bin/tsc', '--noEmit', 'false', '--outDir', 'dist', '--rootDir', '.'], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
const { PasswordCorpus } = await import('../../dist/apps/api/src/auth/password-index.js');
const { PasswordService } = await import('../../dist/apps/api/src/auth/password.service.js');

const approval = JSON.parse(await readFile('tools/assets/password-index.json', 'utf8'));
const index = new PasswordCorpus();
await index.reload('.local/password-index', approval);
try {
  const positions = new Set([0, 1000, 100000, 1000000, 3000000, 5189453]);
  const samples = [], absent = Array.from({ length: 8 }, () => 'Patron-42!-' + randomUUID());
  const negative = new Set(absent); let knownCompliant, count = 0;
  const stream = createReadStream('.local/assets/passwords.txt', { encoding: 'utf8' });
  const lines = createInterface({ input: stream, crlfDelay: Infinity });
  try {
    for await (const line of lines) {
      if (positions.has(count) && !line.includes('\ufffd')) samples.push(line);
      if (!knownCompliant && [...line].length >= 12 && [...line].length <= 128 && /\p{Lu}/u.test(line) && /\p{Ll}/u.test(line) && /\p{Nd}/u.test(line) && /[\p{P}\p{S}]/u.test(line) && !line.includes('\ufffd')) knownCompliant = line;
      assert.equal(negative.has(line), false); count++;
    }
  } finally { lines.close(); stream.destroy(); }
  assert.equal(count, approval.entries); assert.ok(samples.length >= 5); assert.ok(knownCompliant);
  for (const sample of samples) assert.equal(await index.has(sample), true);
  for (const value of absent) assert.equal(await index.has(value), false);
  const service = new PasswordService(index);
  await assert.rejects(service.hashNew(knownCompliant), { code: 'PASSWORD_POLICY' });
  const password = ' ' + absent[0] + 'e\u0301 ';
  const encoded = await service.hashNew(password);
  assert.match(encoded, /^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
  assert.equal(await service.verify(encoded, password), true);
  assert.equal(await service.verify(encoded, password.trim()), false);
  assert.equal(await service.verify(encoded, password.normalize('NFC')), false);
  await index.close();
  await assert.rejects(service.hashNew(password), { code: 'INTERNAL_ERROR' });
  assert.equal(await service.verify(encoded, password), true);
  console.log(JSON.stringify({ status: 'PASS', platform: process.platform, arch: process.arch, node: process.versions.node, corpusEntries: count, positiveSamples: samples.length, negativeSamples: absent.length, nativeArgon2: true }));
} finally { await index.close().catch(() => {}); }
