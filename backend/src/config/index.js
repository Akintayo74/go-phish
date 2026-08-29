'use strict';

// Central configuration. Loads .env once, validates, and exposes a frozen
// config object. Every other module reads config from here rather than
// touching process.env directly.

const path = require('path');
const dotenv = require('dotenv');

// Load backend/.env (if present). In test/CI, env vars may be injected
// directly, so a missing file is not an error.
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const NODE_ENV = process.env.NODE_ENV || 'development';

const config = {
  env: NODE_ENV,
  isProduction: NODE_ENV === 'production',
  isTest: NODE_ENV === 'test',
  port: parseInt(process.env.PORT || '4000', 10),
  databaseUrl:
    process.env.DATABASE_URL ||
    'postgres://catsim:catsim@localhost:5432/catsim_dev',
  // Secret key for HMAC-hashing participant contact identifiers (see
  // src/lib/hash.js). The dev default keeps local/test hashing stable; a real
  // deployment MUST override IDENTITY_HASH_SECRET with a strong random value.
  identityHashSecret:
    process.env.IDENTITY_HASH_SECRET || 'dev-only-insecure-identity-hash-secret',
};

module.exports = Object.freeze(config);
