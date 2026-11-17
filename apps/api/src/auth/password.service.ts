import { randomBytes } from 'node:crypto';
import * as argon2 from 'argon2';
import { ValidationError } from '../../../../packages/contracts/src/validation.js';
import type { CorpusLookup } from './password-index.js';

const reasons = {
  INVALID_UNICODE: 'Introduce texto Unicode válido.', TOO_SHORT: 'Usa al menos 12 caracteres.', TOO_LONG: 'Usa como máximo 128 caracteres.',
  UPPERCASE_REQUIRED: 'Incluye una mayúscula.', LOWERCASE_REQUIRED: 'Incluye una minúscula.', NUMBER_REQUIRED: 'Incluye un número.',
  SYMBOL_REQUIRED: 'Incluye un símbolo; los espacios no cuentan como símbolos.', KNOWN_PASSWORD: 'Elige una contraseña que no figure en la lista de contraseñas conocidas.',
} as const;
export type PasswordReason = keyof typeof reasons;
export function inspectPassword(password: unknown): PasswordReason[] {
  if (typeof password !== 'string' || !password.isWellFormed()) return ['INVALID_UNICODE'];
  let count = 0;
  for (const _point of password) if (++count > 128) return ['TOO_LONG'];
  const result: PasswordReason[] = [];
  if (count < 12) result.push('TOO_SHORT');
  if (!/\p{Lu}/u.test(password)) result.push('UPPERCASE_REQUIRED');
  if (!/\p{Ll}/u.test(password)) result.push('LOWERCASE_REQUIRED');
  if (!/\p{Nd}/u.test(password)) result.push('NUMBER_REQUIRED');
  if (!/[\p{P}\p{S}]/u.test(password)) result.push('SYMBOL_REQUIRED');
  return result;
}
export class PasswordPolicyError extends ValidationError {
  readonly fieldErrors: { field: 'password'; code: PasswordReason }[];
  constructor(failures: PasswordReason[]) {
    super('PASSWORD_POLICY', failures.map(reason => reasons[reason]).join(' '));
    this.fieldErrors = failures.map(code => ({ field: 'password', code }));
  }
}
export class PasswordValidationUnavailable extends ValidationError {
  constructor() { super('INTERNAL_ERROR', 'La validación de contraseñas no está disponible. Inténtalo de nuevo más tarde.'); }
}

// One Argon2 computation per API process, shared across all service instances.
// Rejections always release the queue; the algorithm/cost never degrades under load.
let tail: Promise<unknown> = Promise.resolve();
async function serialized<T>(operation: () => Promise<T>): Promise<T> {
  const result = tail.then(operation, operation);
  tail = result.then(() => undefined, () => undefined);
  return result;
}
export class PasswordService {
  constructor(private readonly corpus: CorpusLookup) {}
  async hashNew(password: string): Promise<string> {
    const failures = inspectPassword(password);
    if (failures.length) throw new PasswordPolicyError(failures);
    let known: boolean;
    try { known = await this.corpus.has(password); } catch { throw new PasswordValidationUnavailable(); }
    if (known) throw new PasswordPolicyError(['KNOWN_PASSWORD']);
    return serialized(() => argon2.hash(password, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1, hashLength: 32, salt: randomBytes(16) }));
  }
  async verify(encoded: string, password: string): Promise<boolean> {
    if (typeof password !== 'string' || !password.isWellFormed() || typeof encoded !== 'string' || !encoded.startsWith('$argon2id$')) return false;
    // No corpus/policy check: previously established credentials remain usable
    // if the corpus is temporarily unavailable or gains a matching entry later.
    return serialized(async () => { try { return await argon2.verify(encoded, password); } catch { return false; } });
  }
}
