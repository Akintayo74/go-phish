'use strict';

// NAMED GUARDRAIL TEST (Phase 3) — admin credential material never leaks.
//
// Phase 3 introduces the first stored secret in the system (admin login
// passwords). The credential-safety posture must hold here too: a raw password
// is never persisted or echoed, and the stored scrypt verifier
// (`password_hash`) is never serialized into any response body. This pins the
// invariant at the repository projection (`toPublic`) — the single choke point
// every admin-user response goes through — and at the one-way password helper,
// so a future change that starts leaking the hash fails the build. The
// end-to-end "login response carries no credential material" assertion lives in
// auth.routes.test.js.

const { toPublic } = require('../src/repositories/adminUsers');
const { hashPassword, verifyPassword } = require('../src/lib/password');

// adminUsers transitively opens the shared knex pool (via the repository base);
// close it so the test process exits cleanly. No query is ever run here.
afterAll(async () => {
  // eslint-disable-next-line global-require
  const { db } = require('../src/db');
  await db.destroy();
});

describe('admin credential-safety guardrail', () => {
  test('toPublic strips password_hash and does not mutate the row', () => {
    const row = {
      id: 'a1',
      email: 'admin@example.test',
      role: 'program_admin',
      password_hash: 'scrypt$16384$aa$bb',
    };
    const safe = toPublic(row);
    expect(safe).not.toHaveProperty('password_hash');
    expect(safe.id).toBe('a1');
    expect(safe.email).toBe('admin@example.test');
    expect(row).toHaveProperty('password_hash');
  });

  test('the stored verifier never contains the raw password and is one-way', () => {
    const raw = 'do-not-store-me-please';
    const stored = hashPassword(raw);
    expect(stored).not.toContain(raw);
    expect(verifyPassword(raw, stored)).toBe(true);
    expect(verifyPassword('other', stored)).toBe(false);
  });
});
