'use strict';

// Phase 8 — automatic enrollment loop. Two additions to `training_assignments`:
//
//  • `completion_token` — an opaque, per-assignment routing token (minted like
//    the Phase 5 tracking token). It lets a participant reach and complete THEIR
//    assigned training without an account: the CAT learning site is deliberately
//    anonymous (guardrail #6, "records nothing about who reads what"), so the
//    only way to tie a completion back to one assignment — without introducing a
//    participant login — is a capability token in the training link. It is not a
//    credential and encodes nothing about the participant.
//
//  • `notified_at` — when the participant was notified by email that they were
//    enrolled. Because the system stores only a keyed HASH of a contact address
//    (guardrail #6), the raw address is supplied transiently by an admin at
//    notify time; only this timestamp is persisted, never the address.

/** @param {import('knex').Knex} knex */
exports.up = async function up(knex) {
  await knex.schema.alterTable('training_assignments', (table) => {
    // `unique()` already creates the lookup index the token needs.
    table.string('completion_token').unique();
    table.timestamp('notified_at', { useTz: true });
  });
};

/** @param {import('knex').Knex} knex */
exports.down = async function down(knex) {
  await knex.schema.alterTable('training_assignments', (table) => {
    table.dropColumn('completion_token');
    table.dropColumn('notified_at');
  });
};
