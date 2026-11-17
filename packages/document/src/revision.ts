import { createHash } from 'node:crypto';
import { object, text, ValidationError } from '../../contracts/src/validation.js';
import { validateDocument } from './schema.js';

export function canonicalize(value: unknown): string {
  if (value === null || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new ValidationError('DOCUMENT_INVALID');
    return JSON.stringify(value);
  }
  if (typeof value === 'string') { text(value); return JSON.stringify(value); }
  if (Array.isArray(value)) {
    if (Object.keys(value).length !== value.length) throw new ValidationError('DOCUMENT_INVALID');
    return '[' + value.map(canonicalize).join(',') + ']';
  }
  const record = object(value);
  return '{' + Object.keys(record).sort().map((key) => {
    text(key);
    return JSON.stringify(key) + ':' + canonicalize(record[key]);
  }).join(',') + '}';
}
export function revisionId(input: unknown): string {
  const { formatVersion, documentId, units, pieces, preparations } = validateDocument(input);
  return createHash('sha256').update(canonicalize({ formatVersion, documentId, units, pieces, preparations }), 'utf8').digest('hex');
}
