'use strict';

// Learning modules — the public Cybersecurity Awareness Training (CAT) content
// (Phase 6). Markdown bodies rendered by the React CAT site. Not gated behind
// failing a simulation; anyone may read them.

/** @param {import('knex').Knex} knex */
exports.up = async function up(knex) {
  await knex.schema.createTable('learning_modules', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('slug').notNullable().unique();
    table.string('title').notNullable();
    table.text('summary');
    table.text('body_markdown');

    // Grouping for the resource library, e.g. 'phishing', 'smishing',
    // 'vishing', 'sim-swap', 'what-to-do-if-you-clicked'.
    table.string('category');

    table.integer('order_index').notNullable().defaultTo(0);
    table.boolean('published').notNullable().defaultTo(false);

    table.timestamps(true, true);
    table.index(['category']);
    table.index(['published']);
  });
};

/** @param {import('knex').Knex} knex */
exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('learning_modules');
};
