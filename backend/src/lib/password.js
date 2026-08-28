'use strict';

// Admin password hashing (Phase 3). Uses Node's built-in scrypt — a memory-hard
// KDF — so we add no native/transitive dependency (bcrypt/argon2 would). Only
// the salted derived key is ever stored; the raw password is never persisted
// and never logged (the request logger already excludes bodies, guardrail #2).
//
// Stored format: `scrypt$<N>$<saltHex>$<hashHex>`. Verification is
// constant-time. NOTE: this is admin-console auth and is entirely separate from
// the simulation's Interaction data — the credential-safety guardrail (#1)
// forbids storing *participant/target* form values, not hashing an admin's own
// login password, which is required and legitimate.

const crypto = require('crypto');

const KEYLEN = 64;
const COST = 16384; // scrypt N; keep in the stored string so it can evolve.
const SALT_BYTES = 16;

function hashPassword(password) {
  if (typeof password !== 'string' || password.length === 0) {
    throw new Error('hashPassword: password is required');
  }
  const salt = crypto.randomBytes(SALT_BYTES);
  const derived = crypto.scryptSync(password, salt, KEYLEN, { N: COST });
  return `scrypt$${COST}$${salt.toString('hex')}$${derived.toString('hex')}`;
}

function verifyPassword(password, stored) {
  if (typeof password !== 'string' || typeof stored !== 'string') return false;
  const parts = stored.split('$');
  if (parts.length !== 4 || parts[0] !== 'scrypt') return false;
  const cost = parseInt(parts[1], 10);
  if (!Number.isInteger(cost) || cost <= 0) return false;
  let salt;
  let expected;
  try {
    salt = Buffer.from(parts[2], 'hex');
    expected = Buffer.from(parts[3], 'hex');
  } catch (_e) {
    return false;
  }
  if (expected.length === 0) return false;
  let derived;
  try {
    derived = crypto.scryptSync(password, salt, expected.length, { N: cost });
  } catch (_e) {
    return false;
  }
  return derived.length === expected.length && crypto.timingSafeEqual(derived, expected);
}

module.exports = { hashPassword, verifyPassword };
