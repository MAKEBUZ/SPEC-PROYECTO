import { createHash } from 'node:crypto';

// Hash raw file bytes, including whitespace and transport metadata. This is
// deliberately separate from the editable revision; never decode before hashing.
export function fileFingerprint(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}
