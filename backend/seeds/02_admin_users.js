'use strict';

// Demo admin/operator accounts for local development (Phase 3). Passwords are
// stored as salted scrypt verifiers (src/lib/password.js), never in the clear.
// Idempotent: clears and re-inserts the accounts it owns.
//
// The literal below is a DEV-ONLY default. Pre-launch checklist §6 requires it
// to be rotated before launch, so outside development the seed refuses to run
// on the default and demands SEED_ADMIN_PASSWORD — seeding a public deployment
// with a password published in this repository would hand anyone who reads it a
// Program Admin session, and that role moves consent and the roster.

const { hashPassword } = require('../src/lib/password');

const DEV_PASSWORD = 'changeme-dev-password';

function seedPassword() {
  const supplied = process.env.SEED_ADMIN_PASSWORD;
  if (supplied) return supplied;
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'seed: SEED_ADMIN_PASSWORD is required in production — refusing to seed ' +
        'demo operators with the public dev password (pre-launch checklist §6)'
    );
  }
  return DEV_PASSWORD;
}

/** @param {import('knex').Knex} knex */
exports.seed = async function seed(knex) {
  const password = seedPassword();

  await knex('admin_users').del();

  await knex('admin_users').insert([
    {
      name: 'Demo Program Admin',
      email: 'admin@example.test',
      password_hash: hashPassword(password),
      role: 'program_admin',
    },
    {
      name: 'Demo Researcher',
      email: 'researcher@example.test',
      password_hash: hashPassword(password),
      role: 'researcher',
    },
  ]);
};
