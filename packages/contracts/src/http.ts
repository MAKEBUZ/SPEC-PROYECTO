export const HTTP_ERRORS = {
  INVALID_INPUT: 400, PASSWORD_POLICY: 400, TOKEN_INVALID: 400, TOKEN_EXPIRED: 400,
  FORMAT_UNSUPPORTED: 400, ARTIFACT_MISMATCH: 400, EXPORT_PROFILE_UNSUPPORTED: 400,
  SESSION_REQUIRED: 401, SESSION_EXPIRED: 401, SESSION_REVOKED: 401, REAUTHENTICATION_FAILED: 401,
  ACCESS_DENIED: 403, ACCOUNT_LIMITED: 403,
  RESOURCE_UNAVAILABLE: 404, OPERATION_RESULT_UNAVAILABLE: 404,
  VERSION_CONFLICT: 409, IDEMPOTENCY_CONFLICT: 409, RESOURCE_TRASHED: 409,
  PARENT_TRASHED: 409, RETENTION_EXPIRED: 409, DEPENDENCIES_BLOCK: 409,
  SCOPE_CHANGED: 409, QUOTA_EXCEEDED: 409, PUBLICATION_INCOMPLETE: 409, OPERATION_PENDING: 409,
  FILE_TOO_LARGE: 413, INTERNAL_ERROR: 500,
} as const;
export type ErrorCode = keyof typeof HTTP_ERRORS;
export function errorResponse(code: ErrorCode, traceId: string) {
  const message = code === 'INTERNAL_ERROR' ? 'No se pudo completar la operación.'
    : code === 'INVALID_INPUT' ? 'Revisa los datos introducidos.'
      : code.startsWith('SESSION_') ? 'Inicia sesión para continuar.' : 'No se puede completar esta solicitud en su estado actual.';
  return { code, message, traceId };
}
export type OperationResult<T> =
  | { operationId: string; state: 'pending' }
  | { operationId: string; state: 'resolved'; outcome: 'success' | 'failure' | 'no_change'; confirmedAt: string; data: T };
export type AccessClass = 'normal' | 'verification' | 'account_recovery';
export { DTO, parseRequest } from './http-dto.js';
export type { HttpDto, DtoName } from './http-dto.js';
