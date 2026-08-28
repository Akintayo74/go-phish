'use strict';

// Opaque tracking-token generation (Phase 5).
//
// Every simulation email carries a UNIQUE per-participant link keyed by one of
// these tokens; the token maps an inbound click/open back to a single
// `interactions` row. It is a ROUTING IDENTIFIER, not a credential and not
// derived from any participant data — it is uniform random, so it leaks nothing
// about who the recipient is and cannot be guessed or enumerated.
//
// 32 random bytes → 256 bits of entropy, encoded url-safe (base64url) so it
// drops straight into a path segment with no escaping. Collisions are
// astronomically unlikely; the `tracking_token` UNIQUE constraint is the final
// backstop (a duplicate insert fails rather than silently aliasing two people).

const crypto = require('crypto');

const DEFAULT_BYTES = 32;

function generateToken(bytes = DEFAULT_BYTES) {
  return crypto.randomBytes(bytes).toString('base64url');
}

module.exports = { generateToken, DEFAULT_BYTES };
