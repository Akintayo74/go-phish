'use strict';

// Admin/console users (Phase 3). These are the operators of the platform
// (Program Admins and Researchers/Evaluators) — NOT simulation participants or
// targets. Authenticating an operator requires storing a password verifier, so
// this table holds `password_hash` (a salted scrypt digest via
// src/lib/password.js), never a raw password.
//
// This is unrelated to the credential-safety guardrail (#1), which forbids the
// `interactions` table from holding a *submitted/target* credential. That
// invariant is untouched here: no simulation form value is stored on this
// table either.

/** @param {import('knex').Knex} knex */
exports.up = async function up(knex) {
  await knex.schema.createTable('admin_users', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('name');
    // Stored lower-cased by the repository; unique so an address maps to one
    // operator account.
    table.string('email').notNullable().unique();
    // Salted scrypt verifier — never a raw password.
    table.string('password_hash').notNullable();
    table
      .string('role')
      .notNullable()
      .defaultTo('researcher')
      .checkIn(['program_admin', 'researcher']);
    table.timestamps(true, true);
  });

  await knex.raw(
    "COMMENT ON COLUMN admin_users.password_hash IS " +
      "'Salted scrypt verifier for the operator login. Never a raw password. " +
      "Unrelated to guardrail #1, which concerns simulation-target credentials.'"
  );
};

/** @param {import('knex').Knex} knex */
exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('admin_users');
};
