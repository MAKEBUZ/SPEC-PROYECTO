import { createHash } from 'node:crypto';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, sep, join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { buildPasswordIndex, PasswordIndex, PasswordCorpus } from '../../apps/api/src/auth/password-index.js';

const roots: string[] = [];
afterEach(async () => {
  for (const directory of roots.splice(0)) {
    if (!resolve(directory).startsWith(resolve(tmpdir()) + sep + 'patron-password-')) throw new Error('Limpieza fuera del directorio de ensayo.');
    await rm(directory, { recursive: true, force: true });
  }
});
async function fixture(entries: string[]) {
  const directory = await mkdtemp(join(tmpdir(), 'patron-password-')); roots.push(directory);
  const source = join(directory, 'source.txt'), outputDirectory = join(directory, 'index');
  const bytes = Buffer.from(entries.join('\n') + '\n'); await writeFile(source, bytes);
  const sourceApproval = { sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length, entries: entries.length, revision: 'fixture', license: 'MIT' };
  return { source, outputDirectory, sourceApproval };
}
it('busca entradas completas, conserva espacios/case/Unicode y ordena por hash', async () => {
  const f = await fixture(['abc', 'Abc', ' leading ', 'é', 'e\u0301', 'x\r', 'abc']);
  const approved = await buildPasswordIndex(f);
  const index = await PasswordIndex.open(f.outputDirectory, approved);
  try {
    for (const entry of ['abc', 'Abc', ' leading ', 'é', 'e\u0301', 'x\r']) expect(await index.has(entry)).toBe(true);
    for (const entry of ['ABC', 'leading', 'ab', 'x']) expect(await index.has(entry)).toBe(false);
    expect(approved.entries).toBe(7); expect(approved.bytes).toBe(7 * 32);
  } finally { await index.close(); }
});
it('construcción reproducible y actualización fallida conserva la generación anterior', async () => {
  const f = await fixture(['uno', 'dos', 'tres']); const first = await buildPasswordIndex(f);
  const second = await buildPasswordIndex(f); expect(second.sha256).toBe(first.sha256);
  const before = await readFile(join(f.outputDirectory, 'current.json'), 'utf8');
  await writeFile(f.source, 'corrupto\n');
  await expect(buildPasswordIndex(f)).rejects.toThrow();
  expect(await readFile(join(f.outputDirectory, 'current.json'), 'utf8')).toBe(before);
  const index = await PasswordIndex.open(f.outputDirectory, first);
  try { expect(await index.has('dos')).toBe(true); } finally { await index.close(); }
});
it('rechaza checksum/contador incorrecto, índice alterado y mantiene lectores de la generación antigua', async () => {
  const f = await fixture(['uno', 'dos']); const approved = await buildPasswordIndex(f);
  await expect(PasswordIndex.open(f.outputDirectory, { ...approved, entries: 3 })).rejects.toThrow();
  await expect(PasswordIndex.open(f.outputDirectory, { ...approved, sha256: '0'.repeat(64) })).rejects.toThrow();
  const old = await PasswordIndex.open(f.outputDirectory, approved);
  await buildPasswordIndex(f);
  try { expect(await old.has('uno')).toBe(true); } finally { await old.close(); }
  const pointer = JSON.parse(await readFile(join(f.outputDirectory, 'current.json'), 'utf8'));
  await writeFile(join(f.outputDirectory, pointer.generation, 'index.bin'), Buffer.alloc(64));
  await expect(PasswordIndex.open(f.outputDirectory, approved)).rejects.toThrow();
});
it('detecta alteración después de abrir y nunca la trata como contraseña ausente', async () => {
  const f = await fixture(['uno', 'dos']); const approved = await buildPasswordIndex(f);
  const index = await PasswordIndex.open(f.outputDirectory, approved);
  try {
    const pointer = JSON.parse(await readFile(join(f.outputDirectory, 'current.json'), 'utf8'));
    await writeFile(join(f.outputDirectory, pointer.generation, 'index.bin'), Buffer.alloc(32));
    await expect(index.has('no incluida')).rejects.toThrow();
    await expect(index.has('uno')).rejects.toThrow();
  } finally { await index.close(); }
});
it('rechaza orden inválido aunque contador y checksum coincidan, y punteros fuera del índice', async () => {
  const f = await fixture(['uno', 'dos']); const approved = await buildPasswordIndex(f);
  const pointer = JSON.parse(await readFile(join(f.outputDirectory, 'current.json'), 'utf8'));
  const directory = join(f.outputDirectory, pointer.generation);
  const bytes = await readFile(join(directory, 'index.bin'));
  const reversed = Buffer.concat([bytes.subarray(32), bytes.subarray(0, 32)]);
  const altered = { ...approved, sha256: createHash('sha256').update(reversed).digest('hex') };
  await writeFile(join(directory, 'index.bin'), reversed);
  await writeFile(join(directory, 'metadata.json'), JSON.stringify(altered));
  await expect(PasswordIndex.open(f.outputDirectory, altered)).rejects.toThrow();
  await writeFile(join(f.outputDirectory, 'current.json'), JSON.stringify({ generation: '../outside' }));
  await expect(PasswordIndex.open(f.outputDirectory, approved)).rejects.toThrow();
});
it('el proveedor inicia indisponible y conserva el último índice válido si falla la recarga', async () => {
  const f = await fixture(['uno', 'dos']); const approval = await buildPasswordIndex(f);
  const corpus = new PasswordCorpus();
  await expect(corpus.has('uno')).rejects.toThrow();
  try {
    await corpus.reload(f.outputDirectory, approval);
    await writeFile(join(f.outputDirectory, 'current.json'), '{corrupto');
    await expect(corpus.reload(f.outputDirectory, approval)).rejects.toThrow();
    expect(await corpus.has('uno')).toBe(true);
  } finally { await corpus.close(); }
});
