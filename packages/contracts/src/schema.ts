import { array, finite, keys, object, text, uuid, ValidationError } from './validation.js';

export interface Contract<T> { json: Record<string, unknown>; parse(input: unknown): T }
export type Value<C> = C extends Contract<infer T> ? T : never;
type Shape = Record<string, Contract<unknown>>;
type Values<S extends Shape> = { [K in keyof S]: Value<S[K]> };
export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export const jsonValue: Contract<JsonValue> = { json: {}, parse(input): JsonValue {
  if (input === null || typeof input === 'boolean') return input;
  if (typeof input === 'string') { text(input); return input; }
  if (typeof input === 'number') { finite(input); return input; }
  if (Array.isArray(input)) return input.map(value => jsonValue.parse(value));
  return Object.fromEntries(Object.entries(object(input)).map(([key, value]) => { text(key); return [key, jsonValue.parse(value)]; }));
} };
export function string(format?: 'uuid' | 'date-time' | 'sha256' | 'nonempty'): Contract<string> {
  return { json: { type: 'string', ...(format === 'sha256' ? { pattern: '^[a-f0-9]{64}$' } : format === 'nonempty' ? { pattern: '\\S' } : format ? { format } : {}) }, parse(input) {
    text(input);
    if (format === 'uuid') uuid(input);
    if (format === 'sha256' && !/^[a-f0-9]{64}$/.test(input)) throw new ValidationError('INVALID_INPUT');
    if (format === 'nonempty' && !input.trim()) throw new ValidationError('INVALID_INPUT');
    if (format === 'date-time' && (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(input) || !Number.isFinite(Date.parse(input)))) throw new ValidationError('INVALID_INPUT');
    return input;
  } };
}
export function enumeration<const T extends readonly (string | number | boolean)[]>(...values: T): Contract<T[number]> {
  return { json: { enum: values }, parse(input) { if (!values.includes(input as T[number])) throw new ValidationError('INVALID_INPUT'); return input as T[number]; } };
}
export const boolean: Contract<boolean> = { json: { type: 'boolean' }, parse(input) { if (typeof input !== 'boolean') throw new ValidationError('INVALID_INPUT'); return input; } };
export function integer(minimum = 0, maximum = Number.MAX_SAFE_INTEGER): Contract<number> {
  return { json: { type: 'integer', minimum, maximum }, parse(input) { finite(input); if (!Number.isSafeInteger(input) || input < minimum || input > maximum) throw new ValidationError('INVALID_INPUT'); return input; } };
}
export const positiveNumber:Contract<number>={json:{type:'number',exclusiveMinimum:0},parse(input){finite(input);if(input<=0)throw new ValidationError('INVALID_INPUT');return input;}};
export function nullable<T>(schema: Contract<T>): Contract<T | null> {
  return { json: { anyOf: [schema.json, { type: 'null' }] }, parse(input) { return input === null ? null : schema.parse(input); } };
}
export function list<T>(schema: Contract<T>): Contract<T[]> {
  return { json: { type: 'array', items: schema.json }, parse(input) { return array(input).map(item => schema.parse(item)); } };
}
export function record<R extends Shape, O extends Shape = Record<never, never>>(required: R, optional: O = {} as O): Contract<Values<R> & Partial<Values<O>>> {
  const fields = { ...required, ...optional };
  return { json: { type: 'object', additionalProperties: false, required: Object.keys(required), properties: Object.fromEntries(Object.entries(fields).map(([key, schema]) => [key, schema.json])) }, parse(input) {
    const value = object(input); keys(value, Object.keys(required), Object.keys(optional));
    const parsed: Record<string, unknown> = Object.create(null);
    for (const [key, schema] of Object.entries(fields)) if (Object.hasOwn(value, key)) parsed[key] = schema.parse(value[key]);
    return parsed as Values<R> & Partial<Values<O>>;
  } };
}
export function union<const C extends readonly Contract<unknown>[]>(...schemas: C): Contract<Value<C[number]>> {
  return { json: { oneOf: schemas.map(schema => schema.json) }, parse(input) {
    const results: unknown[] = [];
    for (const schema of schemas) { try { results.push(schema.parse(input)); } catch (error) { if (!(error instanceof ValidationError)) throw error; } }
    if (results.length !== 1) throw new ValidationError('INVALID_INPUT');
    return results[0] as Value<C[number]>;
  } };
}
