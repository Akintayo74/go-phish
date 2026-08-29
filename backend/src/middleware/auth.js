'use strict';

// Authentication + authorization middleware (Phase 3).
//
// `requireAuth` verifies the `Authorization: Bearer <jwt>` token (stateless —
// no DB round-trip) and attaches the operator identity to `req.admin`.
// `requireRole(...roles)` gates a route to specific roles; it must run after
// `requireAuth`. Both fail closed and never echo the token or request body.

const jwt = require('../lib/jwt');
const { HttpError } = require('../lib/http');

function unauthorized(message = 'unauthorized') {
  return new HttpError(401, message);
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const match = /^Bearer (.+)$/.exec(header);
  if (!match) {
    return next(unauthorized('missing_token'));
  }
  let payload;
  try {
    payload = jwt.verify(match[1]);
  } catch (_e) {
    // Do not distinguish expired/tampered/malformed to a caller.
    return next(unauthorized('invalid_token'));
  }
  req.admin = {
    id: payload.sub,
    email: payload.email,
    role: payload.role,
    name: payload.name,
  };
  return next();
}

function requireRole(...allowed) {
  return function roleGuard(req, res, next) {
    if (!req.admin) return next(unauthorized('missing_token'));
    if (!allowed.includes(req.admin.role)) {
      return next(new HttpError(403, 'forbidden'));
    }
    return next();
  };
}

module.exports = { requireAuth, requireRole };
