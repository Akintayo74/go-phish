'use strict';

// Campaigns — a single phishing-simulation run. Phase 1 defines the backbone;
// Phase 3 adds create/edit/pause APIs and Phase 5 adds delivery. The
// `phase_label` supports Phase II re-tests and phase-over-phase comparison
// (Phase 10). `enrollment_trigger` records the strictness at which a
// participant is auto-enrolled into training (Phase 8): on click, or only on
// a simulated-form submit.

/** @param {import('knex').Knex} knex */
exports.up = async function up(knex) {
  await knex.schema.createTable('campaigns', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('name').notNullable();
    table.text('description');

    // Lifecycle. 'draft' until an admin activates it; 'paused' supports the
    // pause/rollback requirement (Phase 11).
    table
      .string('status')
      .notNullable()
      .defaultTo('draft')
      .checkIn(['draft', 'active', 'paused', 'completed', 'archived']);

    // Free-form label for the research phase this campaign represents,
    // e.g. 'Phase I' / 'Phase II'. Used for side-by-side comparison.
    table.string('phase_label');

    // When submitting counts as failure vs. merely clicking. Drives the
    // automatic enrollment loop (Phase 8).
    table
      .string('enrollment_trigger')
      .notNullable()
      .defaultTo('submitted')
      .checkIn(['clicked', 'submitted']);

    // Optional scheduled send window (Phase 5). Null = manual "send now".
    table.timestamp('scheduled_send_at', { useTz: true });

    table.timestamps(true, true);
    table.index(['status']);
  });
};

/** @param {import('knex').Knex} knex */
exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('campaigns');
};
