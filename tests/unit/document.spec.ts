import { describe, expect, it } from 'vitest';
import { parseDocument, validateDocument } from '../../packages/document/src/schema.js';
import { canonicalize, revisionId } from '../../packages/document/src/revision.js';

const id = '60b46cae-4f0b-4c0f-9456-2a6084fe8044';
const draft = () => ({ formatVersion: 1, documentId: id, revisionId: '0'.repeat(64), units: 'mm', pieces: [], preparations: [] });
describe('estructura y revisión del documento', () => {
  it('admite un documento nuevo sin proyecto ni piezas', () => {
    expect(parseDocument(JSON.stringify(draft()))).toEqual(draft());
  });
  it('rechaza duplicados incluso escritos como escapes JSON', () => {
    expect(() => parseDocument('{"formatVersion":1,"format\\u0056ersion":1}')).toThrow();
  });
  it.each(['{"x":1e999}', '{"x":"\\ud800"}', '{"x":1,}', '{"__proto__":1,"__proto__":2}'])('rechaza %s', (raw) => {
    expect(() => parseDocument(raw)).toThrow();
  });
  it('rechaza formatos futuros, campos arbitrarios y coordenadas no finitas', () => {
    expect(() => validateDocument({ ...draft(), formatVersion: 2 })).toThrow();
    expect(() => validateDocument({ ...draft(), path: 'C:/secret' })).toThrow();
    expect(() => canonicalize({ x: Infinity })).toThrow();
  });
  it('JCS ordena claves, conserva arrays, no redondea ni normaliza texto', () => {
    expect(canonicalize({ z: -0, a: [2, 1], é: 'e\u0301' })).toBe('{"a":[2,1],"z":0,"é":"é"}');
    expect(() => canonicalize({ x: undefined })).toThrow();
  });
  it('la revisión excluye su hash y vinculación remota, pero incluye la identidad editable', () => {
    const original = draft();
    const hash = revisionId(original);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(revisionId({ ...original, revisionId: 'a'.repeat(64) })).toBe(hash);
    expect(revisionId({ ...original, remoteBinding: { accountId: id, patternId: id, lastPublishedVersion: id } })).toBe(hash);
    expect(revisionId({ ...original, documentId: '60b46cae-4f0b-4c0f-9456-2a6084fe8045' })).not.toBe(hash);
  });
  it('no modifica la entrada al validarla', () => {
    const value = Object.freeze(draft());
    expect(validateDocument(value)).toEqual(value);
  });
});

const otherId = '60b46cae-4f0b-4c0f-9456-2a6084fe8045';
const pointId = '60b46cae-4f0b-4c0f-9456-2a6084fe8046';
const incompletePiece = () => ({ id: otherId, name: '', sizeLabel: '', cutQuantity: null, contour: { points: [{ id: pointId, x: 0, y: 0 }], segments: [] }, seamWidth: null, grainline: null, fold: false, cornerJoins: { [pointId]: 'miter' } });
it('conserva una pieza incompleta y de área nula como borrador', () => {
  const value = { ...draft(), pieces: [incompletePiece()] };
  expect(validateDocument(value)).toEqual(value);
  expect(() => validateDocument({ ...value, pieces: [{ ...incompletePiece(), contour: { points: [{ id: pointId, x: Infinity, y: 0 }], segments: [] } }] })).toThrow();
});
it('rechaza IDs duplicados entre entidades del documento', () => {
  expect(() => validateDocument({ ...draft(), pieces: [{ ...incompletePiece(), id: pointId }] })).toThrow();
});
it('conserva referencias faltantes de preparación y las incluye en la revisión', () => {
  const preparation = { id: otherId, name: 'Impresión', selection: [pointId], transforms: { [pointId]: { x: 0, y: 0, rotation: 0 } }, mode: 'tiled', paper: 'A4', margin: 10 };
  const value = { ...draft(), preparations: [preparation] };
  expect(validateDocument(value)).toEqual(value);
  expect(revisionId(value)).not.toBe(revisionId(draft()));
});
