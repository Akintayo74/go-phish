'use strict';

// Admin-user repository (Phase 3). Wraps the base factory and adds the
// guardrail-aware helpers for operator accounts:
//  - createWithPassword: hashes the raw password (src/lib/password.js) before
//    insert, so a raw password is never handed to the DB layer.
//  - findByEmail: normalizes case (emails are stored lower-cased).
//  - toPublic: strips `password_hash` so it can never be serialized into a
//    response body. Route handlers must return `toPublic(row)`, never the raw
//    row.

const { createRepository } = require('./base');
const { hashPassword } = require('../lib/password');

const repo = createRepository('admin_users');

function normalizeEmail(email) {
  return String(email).trim().toLowerCase();
}

async function createWithPassword({ email, password, role, name = null }, trx) {
  return repo.create(
    {
      email: normalizeEmail(email),
      password_hash: hashPassword(password),
      role,
      name,
    },
    trx
  );
}

async function findByEmail(email, trx) {
  return repo.findWhere({ email: normalizeEmail(email) }, trx);
}

// Response-safe projection: never leaks the password hash.
function toPublic(row) {
  if (!row) return row;
  // eslint-disable-next-line no-unused-vars
  const { password_hash, ...safe } = row;
  return safe;
}

module.exports = {
  ...repo,
  normalizeEmail,
  createWithPassword,
  findByEmail,
  toPublic,
};
