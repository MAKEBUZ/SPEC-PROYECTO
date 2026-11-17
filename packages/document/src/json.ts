import { ValidationError } from '../../contracts/src/validation.js';

// JSON.parse alone silently accepts duplicate members. Parse the grammar first,
// comparing decoded property names before constructing the document.
export function parseStrictJson(source: string): unknown {
  let offset = 0;
  const fail = (): never => { throw new ValidationError('DOCUMENT_INVALID', 'El documento contiene JSON inválido.'); };
  const whitespace = () => { while (/[\x20\t\n\r]/.test(source[offset] ?? '\0')) offset++; };
  const string = (): string => {
    const start = offset++;
    while (offset < source.length) {
      const ch = source[offset++];
      if (ch === '\\') { offset++; continue; }
      if (ch === '"') {
        let value: unknown;
        try { value = JSON.parse(source.slice(start, offset)); } catch { return fail(); }
        if (typeof value !== 'string' || !value.isWellFormed()) return fail();
        return value;
      }
    }
    return fail();
  };
  const value = (): unknown => {
    whitespace();
    if (source[offset] === '"') return string();
    if (source[offset] === '{') {
      offset++; whitespace();
      const result = Object.create(null) as Record<string, unknown>;
      if (source[offset] === '}') { offset++; return result; }
      while (true) {
        whitespace();
        if (source[offset] !== '"') return fail();
        const name = string();
        if (Object.hasOwn(result, name)) return fail();
        whitespace(); if (source[offset++] !== ':') return fail();
        result[name] = value(); whitespace();
        const delimiter = source[offset++];
        if (delimiter === '}') return result;
        if (delimiter !== ',') return fail();
      }
    }
    if (source[offset] === '[') {
      offset++; whitespace();
      const result: unknown[] = [];
      if (source[offset] === ']') { offset++; return result; }
      while (true) {
        result.push(value()); whitespace();
        const delimiter = source[offset++];
        if (delimiter === ']') return result;
        if (delimiter !== ',') return fail();
      }
    }
    for (const [literal, result] of [['true', true], ['false', false], ['null', null]] as const) {
      if (source.startsWith(literal, offset)) { offset += literal.length; return result; }
    }
    const match = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(source.slice(offset));
    if (!match) return fail();
    offset += match[0].length;
    const number = Number(match[0]);
    if (!Number.isFinite(number)) return fail();
    return number;
  };
  const result = value(); whitespace();
  if (offset !== source.length) return fail();
  return result;
}
