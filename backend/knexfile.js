'use strict';

// Knex configuration. Migrations and seeds live under backend/migrations and
// backend/seeds; Phase 1 populates them with the CAT-Sim schema.

const path = require('path');

require('dotenv').config();

const connection =
  process.env.DATABASE_URL ||
  'postgres://catsim:catsim@localhost:5432/catsim_dev';

/** @type {import('knex').Knex.Config} */
const base = {
  client: 'pg',
  connection,
  pool: { min: 0, max: 10 },
  // Absolute so the config works whichever directory knex is invoked from —
  // the workspace scripts run with cwd=backend, but scripts/bootstrap.js is
  // reached through the repo root at deploy time.
  migrations: {
    directory: path.resolve(__dirname, 'migrations'),
    tableName: 'knex_migrations',
  },
  seeds: {
    directory: path.resolve(__dirname, 'seeds'),
  },
};

// TLS for the production connection. Managed Postgres (Render, Neon, Supabase,
// Railway, …) terminates TLS with a certificate signed by a root the Node
// process does not carry, so `rejectUnauthorized: false` keeps the transport
// encrypted without failing verification against an unknown CA. A connection
// that stays inside the provider's private network needs no TLS at all — set
// PGSSLMODE=disable there (Render's *internal* database URL is that case).
function productionSsl() {
  if (process.env.PGSSLMODE === 'disable') return false;
  return { rejectUnauthorized: false };
}

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
    // The connection becomes an object so `ssl` can ride alongside the URL.
    connection: { connectionString: connection, ssl: productionSsl() },
    pool: { min: 2, max: 20 },
  },
};
