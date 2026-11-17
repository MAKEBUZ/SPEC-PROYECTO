import { expect, it } from 'vitest';
import { PasswordService, inspectPassword } from '../../apps/api/src/auth/password.service.js';

const unknownCorpus = { has: async () => false };
it('cuenta puntos de código: extremos 12/128 incluidos, sin truncar 129', () => {
  expect(inspectPassword('Aa1!' + '🙂'.repeat(8))).toEqual([]);
  expect(inspectPassword('Aa1!' + '🙂'.repeat(124))).toEqual([]);
  expect(inspectPassword('Aa1!' + '🙂'.repeat(125))).toContain('TOO_LONG');
  expect(inspectPassword('Aa1!' + '🙂'.repeat(7))).toContain('TOO_SHORT');
});
it('usa categorías Unicode y no cuenta espacios como símbolos', () => {
  expect(inspectPassword('Áé١€' + '漢'.repeat(8))).toEqual([]);
  expect(inspectPassword('Áé١ ' + '漢'.repeat(8))).toContain('SYMBOL_REQUIRED');
  expect(inspectPassword('Aa1!' + 'x'.repeat(8) + '\ud800')).toContain('INVALID_UNICODE');
});
it('informa requisitos sin incluir la contraseña en el error', async () => {
  const service = new PasswordService(unknownCorpus);
  const password = 'confidencial';
  await expect(service.hashNew(password)).rejects.toMatchObject({ code: 'PASSWORD_POLICY', fieldErrors: expect.arrayContaining([{ field: 'password', code: 'UPPERCASE_REQUIRED' }]) });
  try { await service.hashNew(password); } catch (error) { expect(String(error)).not.toContain(password); }
});
it('bloquea contraseñas del corpus y falla cerrado si el índice no está disponible', async () => {
  await expect(new PasswordService({ has: async () => true }).hashNew('Conocida-42!Texto')).rejects.toMatchObject({ code: 'PASSWORD_POLICY' });
  await expect(new PasswordService({ has: async () => { throw new Error('private/path'); } }).hashNew('Correcta-42!Texto')).rejects.toMatchObject({ code: 'INTERNAL_ERROR' });
});
it('Argon2id conserva espacios y Unicode, usa sales distintas y parámetros aprobados', async () => {
  const service = new PasswordService(unknownCorpus);
  const password = ' Clave-42!e\u0301xtra ';
  const first = await service.hashNew(password), second = await service.hashNew(password);
  expect(first).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
  expect(first).not.toBe(second);
  expect(await service.verify(first, password)).toBe(true);
  expect(await service.verify(first, password.trim())).toBe(false);
  expect(await service.verify(first, password.normalize('NFC'))).toBe(false);
});
it('iniciar sesión no consulta el corpus ni aplica de nuevo su política', async () => {
  const encoded = await new PasswordService(unknownCorpus).hashNew('Correcta-42!Texto');
  const service = new PasswordService({ has: async () => { throw new Error('Índice ausente'); } });
  expect(await service.verify(encoded, 'Correcta-42!Texto')).toBe(true);
  expect(await service.verify(encoded, 'incorrecta')).toBe(false);
  expect(await service.verify('hash inválido', 'Correcta-42!Texto')).toBe(false);
});
