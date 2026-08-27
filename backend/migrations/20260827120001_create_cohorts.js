'use strict';

// Cohorts — the unit of consent. A campaign may only ever be delivered to
// participants who belong to a cohort whose consent has been granted and not
// withdrawn (guardrail #3, "consent-gated delivery"). Consent lives here at
// the group level; an individual participant can additionally opt out
// (see the participants migration). Delivery endpoints (Phase 2/5) enforce
// this; the schema records the state.

/** @param {import('knex').Knex} knex */
exports.up = async function up(knex) {
  await knex.schema.createTable('cohorts', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('name').notNullable();
    table.text('description');

    // Consent state for the whole cohort. Defaults to 'pending' so a freshly
    // created cohort can never be treated as consented by omission.
    table
      .string('consent_status')
      .notNullable()
      .defaultTo('pending')
      .checkIn(['pending', 'granted', 'withdrawn']);
    table.timestamp('consent_granted_at', { useTz: true });
    table.timestamp('consent_withdrawn_at', { useTz: true });

    table.timestamps(true, true);
  });

  await knex.raw(
    "COMMENT ON TABLE cohorts IS 'Consent unit. A campaign may only target participants in a cohort with consent_status = granted (guardrail: consent-gated delivery).'"
  );
};

/** @param {import('knex').Knex} knex */
exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('cohorts');
};
