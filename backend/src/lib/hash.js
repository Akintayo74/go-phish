'use strict';

// Keyed hashing for participant contact identifiers (guardrail #6, data
// minimization). We store `email_or_phone_hash`, never the raw email/phone.
//
// A keyed HMAC-SHA-256 (rather than a bare hash) makes offline dictionary
// attacks against the stored digests infeasible without the secret. The secret
// comes from config (IDENTITY_HASH_SECRET); it must be set in any real
// deployment. The digest is deterministic so the same address always maps to
// the same participant (needed for de-duplication and enrollment linkage).

const crypto = require('crypto');
const config = require('../config');

// Normalize before hashing so trivial variations (case, surrounding spaces)
// map to the same participant. Phone/email normalization beyond this is a
// caller concern.
function normalizeIdentifier(raw) {
  return String(raw).trim().toLowerCase();
}

function hashIdentifier(raw, secret = config.identityHashSecret) {
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    throw new Error('hashIdentifier: identifier is required');
  }
  return crypto
    .createHmac('sha256', secret)
    .update(normalizeIdentifier(raw))
    .digest('hex');
}

module.exports = { hashIdentifier, normalizeIdentifier };
