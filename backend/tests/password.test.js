'use strict';

// Unit tests for the scrypt password helper (Phase 3).

const { hashPassword, verifyPassword } = require('../src/lib/password');

describe('password hashing', () => {
  test('verifies a correct password', () => {
    const stored = hashPassword('correct horse battery staple');
    expect(verifyPassword('correct horse battery staple', stored)).toBe(true);
  });

  test('rejects a wrong password', () => {
    const stored = hashPassword('correct horse battery staple');
    expect(verifyPassword('wrong password', stored)).toBe(false);
  });

  test('produces a salted verifier that never contains the raw password', () => {
    const stored = hashPassword('super-secret-pw');
    expect(stored).not.toContain('super-secret-pw');
    expect(stored.startsWith('scrypt$')).toBe(true);
    // Two hashes of the same password differ (random salt).
    expect(hashPassword('same')).not.toBe(hashPassword('same'));
  });

  test('fails closed on malformed stored values', () => {
    expect(verifyPassword('x', 'not-a-hash')).toBe(false);
    expect(verifyPassword('x', '')).toBe(false);
    expect(verifyPassword('x', null)).toBe(false);
  });

  test('requires a non-empty password to hash', () => {
    expect(() => hashPassword('')).toThrow();
  });
});
