export class ValidationError extends Error {
  constructor(public readonly code: string, message = 'Los datos no son válidos.') {
    super(message);
    this.name = 'ValidationError';
  }
}

export function object(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new ValidationError('INVALID_INPUT');
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new ValidationError('INVALID_INPUT');
  return value as Record<string, unknown>;
}

export function keys(value: Record<string, unknown>, required: readonly string[], optional: readonly string[] = []): void {
  if (required.some((key) => !Object.hasOwn(value, key)) || Object.keys(value).some((key) => !required.includes(key) && !optional.includes(key))) {
    throw new ValidationError('INVALID_INPUT', 'Faltan campos obligatorios o hay campos no admitidos.');
  }
}

export function text(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !value.isWellFormed()) throw new ValidationError('INVALID_INPUT');
}

export function finite(value: unknown): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new ValidationError('INVALID_INPUT');
}

export function uuid(value: unknown): asserts value is string {
  text(value);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) throw new ValidationError('INVALID_INPUT');
}

export function array(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new ValidationError('INVALID_INPUT');
  return value;
}

export function oneOf(value: unknown, choices: readonly unknown[]): void {
  if (!choices.includes(value)) throw new ValidationError('INVALID_INPUT');
}
