'use strict';

// Phase 10 — Phase II / re-test support. Records campaign lineage so a re-test
// can be cloned from an earlier phase and the two compared side by side (the
// core research payoff).
//
// `cloned_from_campaign_id` points at the campaign this one was cloned from
// (null for an original, first-phase campaign). It is self-referential and set
// only at clone time; it is never part of the editable metadata. ON DELETE SET
// NULL keeps the research record intact if an ancestor draft is ever deleted —
// a clone survives with its lineage link cleared rather than cascading away.
//
// A clone copies only the campaign's *definition* (name/description/trigger),
// never its behavioral data: interactions belong to the phase that produced
// them, so a Phase II campaign starts with a clean slate against the same or an
// updated cohort.

/** @param {import('knex').Knex} knex */
exports.up = async function up(knex) {
  await knex.schema.alterTable('campaigns', (table) => {
    table
      .uuid('cloned_from_campaign_id')
      .nullable()
      .references('id')
      .inTable('campaigns')
      .onDelete('SET NULL');
    table.index(['cloned_from_campaign_id']);
  });

  await knex.raw(
    "COMMENT ON COLUMN campaigns.cloned_from_campaign_id IS 'The campaign this one was cloned from (Phase 10 re-test lineage); null for an original phase. Set only at clone time, never editable.'"
  );
};

/** @param {import('knex').Knex} knex */
exports.down = async function down(knex) {
  await knex.schema.alterTable('campaigns', (table) => {
    table.dropIndex(['cloned_from_campaign_id']);
    table.dropColumn('cloned_from_campaign_id');
  });
};
