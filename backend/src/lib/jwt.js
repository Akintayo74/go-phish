'use strict';

// Minimal, dependency-free HS256 JSON Web Tokens for admin sessions (Phase 3).
//
// The admin console needs stateless bearer tokens; a full JWT library would
// pull in transitive dependencies for a handful of primitives Node already
// ships. We implement exactly the subset we use — HMAC-SHA-256 signing,
// base64url encoding, and `exp` verification with a constant-time signature
// compare — and nothing else (no alg negotiation, so the classic "alg: none"
// downgrade is impossible here: the header is fixed and re-derived on verify).

const crypto = require('crypto');
const config = require('../config');

const HEADER = { alg: 'HS256', typ: 'JWT' };

function base64urlEncode(buf) {
  return Buffer.from(buf)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function base64urlDecode(str) {
  const pad = str.length % 4 === 0 ? '' : '='.repeat(4 - (str.length % 4));
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/') + pad;
  return Buffer.from(b64, 'base64');
}

function sign(payload, { secret = config.jwtSecret, expiresInSeconds = config.jwtExpiresInSeconds } = {}) {
  const nowSec = Math.floor(Date.now() / 1000);
  const body = { ...payload, iat: nowSec, exp: nowSec + expiresInSeconds };
  const headerPart = base64urlEncode(JSON.stringify(HEADER));
  const payloadPart = base64urlEncode(JSON.stringify(body));
  const signingInput = `${headerPart}.${payloadPart}`;
  const signature = base64urlEncode(
    crypto.createHmac('sha256', secret).update(signingInput).digest()
  );
  return `${signingInput}.${signature}`;
}

// Verifies signature and expiry. Returns the decoded payload on success;
// throws an Error with a stable `.code` on any failure so callers can map it to
// a 401 without leaking specifics.
function verify(token, { secret = config.jwtSecret } = {}) {
  if (typeof token !== 'string') throw tokenError('malformed');
  const parts = token.split('.');
  if (parts.length !== 3) throw tokenError('malformed');
  const [headerPart, payloadPart, signaturePart] = parts;

  const signingInput = `${headerPart}.${payloadPart}`;
  const expected = crypto.createHmac('sha256', secret).update(signingInput).digest();
  const provided = base64urlDecode(signaturePart);
  if (
    expected.length !== provided.length ||
    !crypto.timingSafeEqual(expected, provided)
  ) {
    throw tokenError('bad_signature');
  }

  let header;
  let payload;
  try {
    header = JSON.parse(base64urlDecode(headerPart).toString('utf8'));
    payload = JSON.parse(base64urlDecode(payloadPart).toString('utf8'));
  } catch (_e) {
    throw tokenError('malformed');
  }
  if (!header || header.alg !== 'HS256') throw tokenError('bad_alg');

  const nowSec = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== 'number' || nowSec >= payload.exp) {
    throw tokenError('expired');
  }
  return payload;
}

function tokenError(code) {
  const err = new Error(`jwt_${code}`);
  err.code = code;
  return err;
}

module.exports = { sign, verify };
