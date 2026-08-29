'use strict';

// Unit tests for the dependency-free HS256 JWT helper (Phase 3).

const jwt = require('../src/lib/jwt');

describe('jwt.sign / jwt.verify', () => {
  test('round-trips a payload and exposes claims', () => {
    const token = jwt.sign({ sub: 'a1', role: 'program_admin' });
    const payload = jwt.verify(token);
    expect(payload.sub).toBe('a1');
    expect(payload.role).toBe('program_admin');
    expect(typeof payload.iat).toBe('number');
    expect(payload.exp).toBeGreaterThan(payload.iat);
  });

  test('rejects a tampered payload (signature mismatch)', () => {
    const token = jwt.sign({ sub: 'a1', role: 'researcher' });
    const [h, , s] = token.split('.');
    const forgedPayload = Buffer.from(JSON.stringify({ sub: 'a1', role: 'program_admin', exp: 9999999999 }))
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    const forged = `${h}.${forgedPayload}.${s}`;
    expect(() => jwt.verify(forged)).toThrow();
  });

  test('rejects a token signed with a different secret', () => {
    const token = jwt.sign({ sub: 'a1' }, { secret: 'attacker-secret' });
    expect(() => jwt.verify(token)).toThrow();
  });

  test('rejects an expired token', () => {
    const token = jwt.sign({ sub: 'a1' }, { expiresInSeconds: -1 });
    expect(() => jwt.verify(token)).toThrow(/expired/);
  });

  test('rejects a malformed token', () => {
    expect(() => jwt.verify('not-a-jwt')).toThrow(/malformed/);
    expect(() => jwt.verify('')).toThrow();
    expect(() => jwt.verify(null)).toThrow();
  });
});
