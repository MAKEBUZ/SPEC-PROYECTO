import { identity, type FileIdentity } from './save.js';

export type TrashChoice = 'save' | 'discard' | 'trash' | 'cancel';
export interface LocalTrashContext {
  /** Main-process document binding, never a renderer-supplied arbitrary path. */
  path: string;
  expected: FileIdentity;
  dirty(): boolean;
  choose(dirty: boolean): Promise<TrashChoice>;
  save(): Promise<FileIdentity | null>;
  /** Clear the active document only after confirmed OS success. */
  completed(): void;
}
export type LocalTrashResult = 'trashed' | 'cancelled' | 'busy' | 'save_failed' | 'file_changed' | 'trash_failed';

/** Only an OS recycle-bin capability is injected. There is deliberately no
 * unlink, remote transport, PDF path, or permanent-delete fallback here. */
export class LocalDocumentTrash {
  private busy = false;
  constructor(private readonly trashItem: (path: string) => Promise<void>) {}
  async run(context: LocalTrashContext): Promise<LocalTrashResult> {
    if (this.busy) return 'busy';
    this.busy = true;
    try {
      const path = context.path;
      let expected = structuredClone(context.expected);
      const dirty = context.dirty();
      const choice = await context.choose(dirty);
      if (choice === 'cancel' || dirty && choice !== 'save' && choice !== 'discard'
        || !dirty && choice !== 'trash') return 'cancelled';
      if (!dirty && context.dirty()) return 'cancelled';
      if (choice === 'save') {
        try {
          const saved = await context.save();
          if (!saved || context.dirty()) return 'save_failed';
          expected = saved;
        } catch { return 'save_failed'; }
      }
      // Reject file changes while the confirmation/save dialog was open.
      let current: FileIdentity | null;
      try { current = await identity(path); } catch { return 'trash_failed'; }
      if (!current || JSON.stringify(current) !== JSON.stringify(expected)) return 'file_changed';
      try { await this.trashItem(path); } catch { return 'trash_failed'; }
      // A resolved adapter that left a file at the destination is not success.
      try { if (await identity(path)) return 'trash_failed'; } catch { return 'trash_failed'; }
      context.completed();
      return 'trashed';
    } finally { this.busy = false; }
  }
}
