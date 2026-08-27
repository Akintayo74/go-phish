'use strict';

// Shared Knex instance for the backend. Phase 1 adds migrations and the
// repository layer on top of this connection; for Phase 0 it simply provides
// a single pooled client and a lightweight connectivity check for /health.

const knexFactory = require('knex');
const knexConfig = require('../../knexfile');
const config = require('../config');

const db = knexFactory(knexConfig[config.env] || knexConfig.development);

// Returns true if the database answers a trivial query, false otherwise.
// Never throws — the health route uses it to report status without crashing.
async function checkConnection() {
  try {
    await db.raw('select 1');
    return true;
  } catch (err) {
    return false;
  }
}

module.exports = { db, checkConnection };
