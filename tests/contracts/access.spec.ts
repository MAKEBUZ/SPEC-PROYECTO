import { expect, it } from 'vitest';
import { authorizeAccess } from '../../apps/api/src/http/access.js';

const session = { kind: 'session' as const, accountId: 'account', accessClass: 'normal' as const, accountStatus: 'active' as const, verified: true, expiresAt: 2000, revoked: false };
it('deniega sesión ausente, vencida, revocada y clases limitadas para recursos normales', () => {
  expect(() => authorizeAccess('normal', undefined, 1000)).toThrow();
  expect(() => authorizeAccess('normal', { ...session, expiresAt: 1000 }, 1000)).toThrow();
  expect(() => authorizeAccess('normal', { ...session, revoked: true }, 1000)).toThrow();
  expect(() => authorizeAccess('normal', { ...session, accessClass: 'verification', accountStatus: 'pending_verification', verified: false }, 1000)).toThrow();
  expect(() => authorizeAccess('normal', session, 1000)).not.toThrow();
});
it('credencial de eliminación no abre recursos ni otra solicitud', () => {
  const credential = { kind: 'deletion' as const, requestId: 'request-one', expiresAt: 2000 };
  expect(() => authorizeAccess('normal', credential, 1000)).toThrow();
  expect(() => authorizeAccess('deletion_credential', credential, 1000, 'request-two')).toThrow();
  expect(() => authorizeAccess('deletion_credential', credential, 1000, 'request-one')).not.toThrow();
});
it('cerrar la propia sesión vencida no amplía sus facultades', () => {
  expect(() => authorizeAccess('own_session', { ...session, expiresAt: 0, revoked: true }, 1000)).not.toThrow();
  expect(() => authorizeAccess('account_recovery', session, 1000)).toThrow();
});
