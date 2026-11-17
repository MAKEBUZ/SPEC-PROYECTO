import { array, finite, keys, object, oneOf, text, uuid, ValidationError } from '../../contracts/src/validation.js';
import { parseStrictJson } from './json.js';
import { assertPiece } from './piece.js';
import type { Piece } from './piece.js';

export interface PatternDocument {
  formatVersion: 1;
  documentId: string;
  revisionId: string;
  units: 'mm';
  pieces: Piece[];
  preparations: Record<string, unknown>[];
  remoteBinding?: { accountId: string; patternId: string; lastPublishedVersion: string };
}

function uniqueIds(items: unknown[]): Set<string> {
  const seen = new Set<string>();
  for (const item of items) {
    const { id } = object(item); uuid(id);
    if (seen.has(id)) throw new ValidationError('DOCUMENT_INVALID', 'Hay identificadores repetidos.');
    seen.add(id);
  }
  return seen;
}
function preparation(input: unknown, names: Set<string>): void {
  const p = object(input); keys(p, ['id', 'name', 'selection', 'transforms', 'mode', 'paper', 'margin']);
  uuid(p.id); text(p.name);
  const name = p.name.trim().toLowerCase();
  if (!name || names.has(name)) throw new ValidationError('DOCUMENT_INVALID', 'Nombre de preparación vacío o repetido.');
  names.add(name); oneOf(p.mode, ['large', 'tiled']); oneOf(p.paper, ['A4', 'Letter']); finite(p.margin);
  if (p.margin < 0) throw new ValidationError('DOCUMENT_INVALID');
  const selection = array(p.selection); const selected = new Set<string>();
  for (const id of selection) { uuid(id); if (selected.has(id)) throw new ValidationError('DOCUMENT_INVALID'); selected.add(id); }
  // Missing pieces intentionally survive; validity for production is separate.
  for (const [id, inputTransform] of Object.entries(object(p.transforms))) {
    uuid(id); if (!selected.has(id)) throw new ValidationError('DOCUMENT_INVALID');
    const transform = object(inputTransform); keys(transform, ['x', 'y', 'rotation']);
    finite(transform.x); finite(transform.y); finite(transform.rotation);
  }
  if (selected.size !== Object.keys(object(p.transforms)).length) throw new ValidationError('DOCUMENT_INVALID');
}
export function validateDocument(input: unknown): PatternDocument {
  const d = object(input); keys(d, ['formatVersion', 'documentId', 'revisionId', 'units', 'pieces', 'preparations'], ['remoteBinding']);
  if (d.formatVersion !== 1) throw new ValidationError('FORMAT_UNSUPPORTED', 'Versión de documento no admitida.');
  uuid(d.documentId); text(d.revisionId);
  if (!/^[a-f0-9]{64}$/.test(d.revisionId)) throw new ValidationError('DOCUMENT_INVALID');
  oneOf(d.units, ['mm']);
  const pieces = array(d.pieces), preparations = array(d.preparations);
  uniqueIds(pieces); uniqueIds(preparations); pieces.forEach(assertPiece);
  const entities: unknown[] = [{ id: d.documentId }, ...pieces, ...preparations];
  for (const inputPiece of pieces) {
    const contour = object(object(inputPiece).contour);
    entities.push(...array(contour.points), ...array(contour.segments));
  }
  uniqueIds(entities);
  const names = new Set<string>(); preparations.forEach((p) => preparation(p, names));
  if (d.remoteBinding !== undefined) {
    const binding = object(d.remoteBinding); keys(binding, ['accountId', 'patternId', 'lastPublishedVersion']);
    uuid(binding.accountId); uuid(binding.patternId); uuid(binding.lastPublishedVersion);
  }
  return d as unknown as PatternDocument;
}
export function parseDocument(source: string): PatternDocument {
  return validateDocument(parseStrictJson(source));
}
