'use strict';

// ============================================================================
// GUARDRAIL TEST (named, explicit) — Interaction table has NO credential column.
// ============================================================================
// This is the Phase 1 schema-level enforcement of guardrail #1 ("no real
// credentials, ever"). It runs WITHOUT a database: it drives the interactions
// migration through a recording stub and asserts the exact set of columns it
// declares, then asserts none of them could hold a credential or raw form
// value. If a future change adds e.g. a `password` or `form_data` column to
// the interactions migration, this test fails the build. Do not weaken it.
// ============================================================================

const interactionsMigration = require('../migrations/20260827120004_create_interactions');

// Column-defining builder methods take the new column name as their first
// argument. Modifier/relationship methods (references, unique, index, ...) do
// not create columns and are ignored by the recorder.
const COLUMN_METHODS = new Set([
  'uuid',
  'string',
  'text',
  'boolean',
  'integer',
  'bigInteger',
  'jsonb',
  'json',
  'timestamp',
  'datetime',
  'date',
  'float',
  'decimal',
]);

// Records the columns declared by a knex `createTable` callback.
function recordColumns(buildFn) {
  const columns = [];

  const chainable = new Proxy(function () {}, {
    get() {
      // Every modifier (.notNullable(), .defaultTo(), .references(), ...)
      // returns something chainable and is otherwise a no-op here.
      return () => chainable;
    },
    apply() {
      return chainable;
    },
  });

  const table = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === 'timestamps') {
          return () => {
            columns.push('created_at', 'updated_at');
            return chainable;
          };
        }
        return (...args) => {
          if (COLUMN_METHODS.has(prop) && typeof args[0] === 'string') {
            columns.push(args[0]);
          }
          // `unique`/`index` receive arrays (composite) — not new columns.
          return chainable;
        };
      },
    }
  );

  buildFn(table);
  return columns;
}

// Minimal knex stub: captures the createTable callback, no-ops raw().
function stubKnex() {
  let captured = null;
  const knex = {
    raw: async () => {},
    fn: { now: () => 'now()' },
    schema: {
      createTable: async (_name, cb) => {
        captured = cb;
      },
    },
  };
  return { knex, getCallback: () => captured };
}

describe('interactions schema guardrail', () => {
  const EXPECTED_COLUMNS = [
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

  // Substrings/patterns that would indicate a column capable of holding a
  // submitted credential or raw form value.
  const FORBIDDEN = [
    /pass(word|wd)?/i,
    /credential/i,
    /secret/i,
    /user_?name/i,
    /form_?data/i,
    /payload/i,
    /plain_?text/i,
    /req(uest)?_?body/i,
    /\botp\b/i,
    /\bpin\b/i,
    /raw_/i,
  ];

  let columns;

  beforeAll(async () => {
    const { knex, getCallback } = stubKnex();
    await interactionsMigration.up(knex);
    columns = recordColumns(getCallback());
  });

  test('declares exactly the expected behavioral columns', () => {
    expect(columns.slice().sort()).toEqual(EXPECTED_COLUMNS.slice().sort());
  });

  test('has no column capable of holding a credential or raw form value', () => {
    for (const col of columns) {
      for (const pattern of FORBIDDEN) {
        expect(col).not.toMatch(pattern);
      }
    }
  });

  test('`submitted` is a boolean flag, with no companion value column', () => {
    expect(columns).toContain('submitted');
    // Nothing like `submitted_value`, `submitted_data`, etc.
    const valueLike = columns.filter(
      (c) => c.startsWith('submitted') && !['submitted', 'submitted_at'].includes(c)
    );
    expect(valueLike).toEqual([]);
  });
});
