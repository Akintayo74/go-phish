'use strict';

// Demo admin/operator accounts for local development (Phase 3). Dev-only
// credentials — do NOT use these in any real deployment. Passwords are stored
// as salted scrypt verifiers (src/lib/password.js), never in the clear.
// Idempotent: clears and re-inserts the accounts it owns.

const { hashPassword } = require('../src/lib/password');

const DEV_PASSWORD = 'changeme-dev-password';

/** @param {import('knex').Knex} knex */
exports.seed = async function seed(knex) {
  await knex('admin_users').del();

  await knex('admin_users').insert([
    {
      name: 'Demo Program Admin',
      email: 'admin@example.test',
      password_hash: hashPassword(DEV_PASSWORD),
      role: 'program_admin',
    },
    {
      name: 'Demo Researcher',
      email: 'researcher@example.test',
      password_hash: hashPassword(DEV_PASSWORD),
      role: 'researcher',
    },
  ]);
};
