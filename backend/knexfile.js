'use strict';

// Knex configuration. Migrations and seeds live under backend/migrations and
// backend/seeds; Phase 1 populates them with the CAT-Sim schema.

require('dotenv').config();

const connection =
  process.env.DATABASE_URL ||
  'postgres://catsim:catsim@localhost:5432/catsim_dev';

/** @type {import('knex').Knex.Config} */
const base = {
  client: 'pg',
  connection,
  pool: { min: 0, max: 10 },
  migrations: {
    directory: './migrations',
    tableName: 'knex_migrations',
  },
  seeds: {
    directory: './seeds',
  },
};

module.exports = {
  development: base,
  test: {
    ...base,
    connection:
      process.env.DATABASE_URL ||
      'postgres://catsim:catsim@localhost:5432/catsim_test',
  },
  production: {
    ...base,
    pool: { min: 2, max: 20 },
  },
};
