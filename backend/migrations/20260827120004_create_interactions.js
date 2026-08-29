'use strict';

// ============================================================================
// GUARDRAIL #1 — NO REAL CREDENTIALS, EVER (enforced at the schema level).
// ============================================================================
// This table records ONLY behavioral flags and timestamps for a participant's
// journey through a simulation: whether they opened the email, clicked the
// tracked link, submitted the dummy form, and saw the disclosure page.
//
// It MUST NOT contain any column capable of holding a submitted credential or
// any raw form value — no `username`, `password`, `email`, `credential`,
// `secret`, `form_data`, `payload`, `body`, or similar. The simulated form
// handler (Phase 4) sets `submitted = true` and DISCARDS the posted values;
// there is deliberately nowhere here to persist them.
//
// If you are adding a column to this table, stop: any column that could hold
// user-entered text is a guardrail violation. The named test
// `tests/schema.interactions.guardrail.test.js` asserts the exact column set
// and fails the build if this drifts.
// ============================================================================

/** @param {import('knex').Knex} knex */
exports.up = async function up(knex) {
  await knex.schema.createTable('interactions', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));

    table
      .uuid('campaign_id')
      .notNullable()
      .references('id')
      .inTable('campaigns')
      .onDelete('CASCADE');

    table
      .uuid('participant_id')
      .notNullable()
      .references('id')
      .inTable('participants')
      .onDelete('CASCADE');

    // Opaque per-participant link token (Phase 5). Not a credential; a random
    // routing identifier that maps an inbound click back to this row.
    table.string('tracking_token').notNullable().unique();

    // Behavioral flags + timestamps. Flags default false; timestamps stay null
    // until the corresponding event occurs.
    table.boolean('opened').notNullable().defaultTo(false);
    table.timestamp('opened_at', { useTz: true });

    table.boolean('clicked').notNullable().defaultTo(false);
    table.timestamp('clicked_at', { useTz: true });

    // `submitted` is a pure boolean: it records THAT the dummy form was
    // submitted, never WHAT was typed. There is no companion value column.
    table.boolean('submitted').notNullable().defaultTo(false);
    table.timestamp('submitted_at', { useTz: true });

    // Disclosure reached (guardrail #4, transparency).
    table.boolean('disclosed').notNullable().defaultTo(false);
    table.timestamp('disclosed_at', { useTz: true });

    table.timestamps(true, true);

    // One interaction row per participant per campaign.
    table.unique(['campaign_id', 'participant_id']);
    table.index(['campaign_id']);
  });

  await knex.raw(
    "COMMENT ON TABLE interactions IS 'Behavioral flags + timestamps only. Guardrail #1: no column may hold a submitted credential or raw form value. The dummy form handler discards posted values and records only submitted = true.'"
  );
  await knex.raw(
    "COMMENT ON COLUMN interactions.submitted IS 'Boolean only: records that the dummy form was submitted, never the values entered.'"
  );
};

/** @param {import('knex').Knex} knex */
exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('interactions');
};
