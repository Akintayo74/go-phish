'use strict';

// Test helper: mint a valid admin session token so route tests can exercise the
// authenticated endpoints without a DB. Uses the real signer, so the token
// verifies against the same secret the middleware reads from config.

const jwt = require('../../src/lib/jwt');
const { ROLES } = require('../../src/lib/roles');

function token({ id = 'admin-1', email = 'admin@example.test', role = ROLES.PROGRAM_ADMIN, name = 'Test Admin' } = {}) {
  return jwt.sign({ sub: id, email, role, name });
}

// Returns ['Authorization', 'Bearer <token>'] for supertest's .set(...).
function authHeader(opts) {
  return ['Authorization', `Bearer ${token(opts)}`];
}

module.exports = { token, authHeader, ROLES };
