'use strict';

// Quizzes — knowledge checks attached to a learning module (Phase 7 builds the
// scoring engine). `pass_threshold` is the percent correct required to pass.
// For the MVP the question bank is stored as JSONB; Phase 7 may normalize into
// a dedicated questions table if needed. No participant answers are stored
// here — quiz results feed completion tracking (Phase 8), not this table.

/** @param {import('knex').Knex} knex */
exports.up = async function up(knex) {
  await knex.schema.createTable('quizzes', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));

    table
      .uuid('learning_module_id')
      .notNullable()
      .references('id')
      .inTable('learning_modules')
      .onDelete('CASCADE');

    table.string('title').notNullable();

    // Percent (0–100) correct required to pass.
    table
      .integer('pass_threshold')
      .notNullable()
      .defaultTo(70)
      .checkBetween([0, 100]);

    // MVP question bank: [{ prompt, choices: [...], answer_index }, ...].
    table.jsonb('questions').notNullable().defaultTo('[]');

    table.timestamps(true, true);
    table.index(['learning_module_id']);
  });
};

/** @param {import('knex').Knex} knex */
exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('quizzes');
};
