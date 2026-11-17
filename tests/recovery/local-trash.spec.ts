import { expect, it } from 'vitest';
import { mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { identity } from '../../apps/desktop/src/main/documents/save.js';
import { LocalDocumentTrash, type LocalTrashContext, type TrashChoice } from '../../apps/desktop/src/main/documents/trash.js';

async function fixture(run: (f: { context: LocalTrashContext; path: string; bin: string;
  choose(value: TrashChoice): void; dirty(value: boolean): void; memory(): string; sends(): number;
  trash: LocalDocumentTrash }) => Promise<void>) {
  const directory = await mkdtemp(join(tmpdir(), 'patron-trash-'));
  const path = join(directory, 'document.patron'), bin = join(directory, 'recycled.patron');
  await writeFile(path, 'saved'); await writeFile(join(directory, 'production.pdf'), 'PDF');
  let dirty = true, memory = 'edited', choice: TrashChoice = 'cancel', sends = 0;
  const context: LocalTrashContext = { path, expected: (await identity(path))!, dirty: () => dirty,
    choose: async () => choice, save: async () => { await writeFile(path, memory); dirty = false; return identity(path); },
    completed: () => { memory = ''; } };
  const trash = new LocalDocumentTrash(async file => { sends++; await rename(file, bin); });
  try {
    await run({ context, path, bin, choose: value => { choice = value; }, dirty: value => { dirty = value; },
      memory: () => memory, sends: () => sends, trash });
    expect(await readFile(join(directory, 'production.pdf'), 'utf8')).toBe('PDF');
  } finally { await rm(directory, { recursive: true, force: true }); }
}
it('cancels without changing the file or unsaved work', async () => fixture(async f => {
  expect(await f.trash.run(f.context)).toBe('cancelled'); expect(f.sends()).toBe(0);
  expect(f.memory()).toBe('edited'); expect(await readFile(f.path, 'utf8')).toBe('saved');
}));
it.each(['save', 'discard'] as const)('sends the explicitly selected %s version and clears memory only on confirmation', async choice => fixture(async f => {
  f.choose(choice); expect(await f.trash.run(f.context)).toBe('trashed');
  expect(await readFile(f.bin, 'utf8')).toBe(choice === 'save' ? 'edited' : 'saved');
  expect(f.memory()).toBe(''); expect(f.sends()).toBe(1);
}));
it('aborts after failed save and after edits made during saving', async () => fixture(async f => {
  f.choose('save'); f.context.save = async () => { throw new Error('Disk full'); };
  expect(await f.trash.run(f.context)).toBe('save_failed');
  f.context.save = async () => identity(f.path);
  expect(await f.trash.run(f.context)).toBe('save_failed'); expect(f.sends()).toBe(0);
  expect(f.memory()).toBe('edited'); expect(await readFile(f.path, 'utf8')).toBe('saved');
}));
it('preserves unsaved memory on unavailable OS trash without permanent deletion', async () => fixture(async f => {
  f.choose('discard');
  const trash = new LocalDocumentTrash(async () => { throw new Error('Trash unavailable on this volume'); });
  expect(await trash.run(f.context)).toBe('trash_failed');
  expect(f.memory()).toBe('edited'); expect(await readFile(f.path, 'utf8')).toBe('saved');
}));
it('refuses changed files and false confirmations from the OS adapter', async () => fixture(async f => {
  f.choose('discard'); await writeFile(f.path, 'external');
  expect(await f.trash.run(f.context)).toBe('file_changed'); expect(f.sends()).toBe(0);
  f.context.expected = (await identity(f.path))!;
  expect(await new LocalDocumentTrash(async () => {}).run(f.context)).toBe('trash_failed');
  expect(f.memory()).toBe('edited'); expect(await readFile(f.path, 'utf8')).toBe('external');
}));
it('requires clean-document confirmation and excludes concurrent deletion', async () => fixture(async f => {
  f.dirty(false); f.choose('discard'); expect(await f.trash.run(f.context)).toBe('cancelled');
  let release!: (choice: TrashChoice) => void;
  f.context.choose = () => new Promise(resolve => { release = resolve; });
  const first = f.trash.run(f.context); expect(await f.trash.run(f.context)).toBe('busy');
  release('trash'); expect(await first).toBe('trashed'); expect(f.sends()).toBe(1);
}));
it('asks again if a previously clean document changes during confirmation', async () => fixture(async f => {
  f.dirty(false);
  f.context.choose = async () => { f.dirty(true); return 'trash'; };
  expect(await f.trash.run(f.context)).toBe('cancelled'); expect(f.sends()).toBe(0);
  expect(f.memory()).toBe('edited'); expect(await readFile(f.path, 'utf8')).toBe('saved');
}));
