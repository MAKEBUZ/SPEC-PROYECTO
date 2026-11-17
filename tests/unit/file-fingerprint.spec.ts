import { expect, it } from 'vitest';
import { fileFingerprint } from '../../packages/document/src/file-fingerprint.js';

it('distingue cambios de bytes aunque el JSON editable sea equivalente', () => {
  expect(fileFingerprint(Buffer.from('{}'))).not.toBe(fileFingerprint(Buffer.from('{ }')));
  expect(fileFingerprint(Buffer.from('abc'))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  expect(fileFingerprint(new Uint8Array([0xff]))).not.toBe(fileFingerprint(new Uint8Array([0xfe])));
});
