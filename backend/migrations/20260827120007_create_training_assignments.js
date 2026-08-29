'use strict';

// Training assignments — the output of the automatic enrollment loop (Phase 8).
// When a participant clicks/submits (per the campaign's enrollment_trigger),
// a row is created here linking them to a learning module, recording WHY they
// were assigned, and tracking completion. This is the one place per-individual
// linkage is intentional; management/researcher views remain aggregate-only
// (guardrail #5).

/** @param {import('knex').Knex} knex */
exports.up = async function up(knex) {
  await knex.schema.createTable('training_assignments', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));

    table
      .uuid('participant_id')
      .notNullable()
      .references('id')
      .inTable('participants')
      .onDelete('CASCADE');

    table
      .uuid('learning_module_id')
      .notNullable()
      .references('id')
      .inTable('learning_modules')
      .onDelete('RESTRICT');

    // The campaign whose interaction triggered this assignment. Nullable so a
    // module can also be assigned outside a campaign if ever needed.
    table
      .uuid('campaign_id')
      .references('id')
      .inTable('campaigns')
      .onDelete('SET NULL');

    // Why the participant was enrolled, e.g. 'clicked_link', 'submitted_form'.
    table.string('assigned_reason').notNullable();

    table
      .string('status')
      .notNullable()
      .defaultTo('assigned')
      .checkIn(['assigned', 'in_progress', 'completed']);

    table.timestamp('assigned_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('completed_at', { useTz: true });

    table.timestamps(true, true);

    // A participant is assigned a given module at most once per campaign.
    table.unique(['participant_id', 'learning_module_id', 'campaign_id']);
    table.index(['participant_id']);
    table.index(['status']);
  });
};

/** @param {import('knex').Knex} knex */
exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('training_assignments');
};
