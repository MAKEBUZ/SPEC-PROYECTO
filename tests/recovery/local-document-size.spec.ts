import { expect, it } from 'vitest';
import { copyFile, mkdtemp, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DocumentWriter, type ReplacementAdapter } from '../../apps/desktop/src/main/documents/save.js';
import { openDocument } from '../../apps/desktop/src/main/documents/open.js';
import type { PatternDocument } from '../../packages/document/src/schema.js';

it('saves and opens a structurally valid local document larger than the publication quota', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'patron-local-size-'));
  // Large valid text exercises the actual byte boundary without a million nodes.
  const document: PatternDocument = {
    formatVersion: 1, documentId: '80000000-0000-4000-8000-000000000001', revisionId: '0'.repeat(64),
    units: 'mm', pieces: [], preparations: [{ id: '80000000-0000-4000-8000-000000000002',
      name: 'x'.repeat(100000001), selection: [], transforms: {}, mode: 'large', paper: 'A4', margin: 10 }],
  };
  // Native replacement certification belongs to T041; this tests quota separation.
  const adapter: ReplacementAdapter = { assertSupported: async () => {}, flush: async () => {},
    create: async (destination, temporary) => copyFile(temporary, destination, 1),
    replace: async () => { throw new Error('Unexpected replacement'); } };
  try {
    const path = join(directory, 'large.patron');
    const saved = await new DocumentWriter(join(directory, 'recovery'), adapter).save({ path, snapshot: document, expected: null });
    expect((await stat(path)).size).toBeGreaterThan(100000000);
    const opened = await openDocument(path, adapter);
    expect(opened.snapshot.revisionId).toBe(saved.snapshot.revisionId);
    expect((opened.snapshot.preparations[0]!.name as string).length).toBe(100000001);
  } finally { await rm(directory, { recursive: true, force: true }); }
}, 60000);
