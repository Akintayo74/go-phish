'use strict';

// Participants — org staff who may be targeted by a simulation. Data
// minimization (guardrail #6, NDPC-aligned): we store role / department /
// cohort and a *hashed* contact identifier, never raw PII where feasible.
//
// `email_or_phone_hash` is a keyed hash of the participant's email or phone
// (see src/lib/hash.js). It exists for de-duplication and per-participant
// linkage in the enrollment loop; it is not reversible to the raw address.
// An individual may opt out even inside a consented cohort (guardrail #3,
// "opted-in"); `opted_out = true` excludes them from all delivery.

/** @param {import('knex').Knex} knex */
exports.up = async function up(knex) {
  await knex.schema.createTable('participants', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));

    table
      .uuid('cohort_id')
      .notNullable()
      .references('id')
      .inTable('cohorts')
      .onDelete('RESTRICT');

    // Hashed identifier only — no raw email/phone column by design.
    table.string('email_or_phone_hash').notNullable().unique();

    // Minimal demographic attributes used only for aggregate reporting.
    table.string('role');
    table.string('department');

    // Individual opt-out, independent of cohort-level consent.
    table.boolean('opted_out').notNullable().defaultTo(false);
    table.timestamp('opted_out_at', { useTz: true });

    table.timestamps(true, true);
    table.index(['cohort_id']);
    table.index(['department']);
  });

  await knex.raw(
    "COMMENT ON COLUMN participants.email_or_phone_hash IS 'Keyed hash of contact identifier. Raw email/phone is never stored (guardrail: data minimization).'"
  );
};

/** @param {import('knex').Knex} knex */
exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('participants');
};
