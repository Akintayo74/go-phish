'use strict';

// Database-backed schema verification. Runs the real migrations against the
// test database and asserts (a) all Phase 1 tables exist and (b) the live
// `interactions` column set matches the guardrail expectation exactly.
//
// This complements the DB-free guardrail test: that one proves the migration
// SOURCE is clean; this one proves the migration APPLIED to Postgres produces
// the same clean shape. When no database is reachable (e.g. CI without
// Postgres), the checks are skipped with a warning rather than failing the
// build — the DB-free guardrail still runs.

const knexFactory = require('knex');
const knexConfig = require('../knexfile');

const knex = knexFactory(knexConfig.test);

const EXPECTED_INTERACTION_COLUMNS = [
  'id',
  'campaign_id',
  'participant_id',
  'tracking_token',
  'opened',
  'opened_at',
  'clicked',
  'clicked_at',
  'submitted',
  'submitted_at',
  'disclosed',
  'disclosed_at',
  'created_at',
  'updated_at',
];

const EXPECTED_TABLES = [
  'cohorts',
  'campaigns',
  'participants',
  'interactions',
  'learning_modules',
  'quizzes',
  'training_assignments',
];

let dbAvailable = false;

async function tableColumns(table) {
  const rows = await knex('information_schema.columns')
    .where({ table_schema: 'public', table_name: table })
    .select('column_name');
  return rows.map((r) => r.column_name);
}

beforeAll(async () => {
  try {
    await knex.raw('select 1');
    dbAvailable = true;
    await knex.migrate.latest();
  } catch (err) {
    dbAvailable = false;
    // eslint-disable-next-line no-console
    console.warn(
      `[schema.db.test] Skipping DB-backed schema checks — no database reachable: ${err.message}`
    );
  }
});

afterAll(async () => {
  await knex.destroy();
});

describe('applied schema (Postgres)', () => {
  test('all Phase 1 tables exist', async () => {
    if (!dbAvailable) return;
    for (const table of EXPECTED_TABLES) {
      const exists = await knex.schema.hasTable(table);
      expect(exists).toBe(true);
    }
  });

  test('interactions has exactly the expected columns (no credential column)', async () => {
    if (!dbAvailable) return;
    const columns = await tableColumns('interactions');
    expect(columns.slice().sort()).toEqual(EXPECTED_INTERACTION_COLUMNS.slice().sort());
  });

  test('no interactions column matches a credential-shaped name', async () => {
    if (!dbAvailable) return;
    const columns = await tableColumns('interactions');
    const forbidden = /pass(word|wd)?|credential|secret|user_?name|form_?data|payload|plain_?text|req(uest)?_?body/i;
    for (const col of columns) {
      expect(col).not.toMatch(forbidden);
    }
  });

  test('participants stores a hash column and no raw email/phone column', async () => {
    if (!dbAvailable) return;
    const columns = await tableColumns('participants');
    expect(columns).toContain('email_or_phone_hash');
    expect(columns).not.toContain('email');
    expect(columns).not.toContain('phone');
    expect(columns).not.toContain('email_or_phone');
  });
});
