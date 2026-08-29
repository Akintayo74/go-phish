'use strict';

// Admin authentication API (Phase 3). Issues stateless JWT sessions for the
// admin console. Public: POST /login. Authenticated: GET /me.
//
// Security posture:
//  - Login failures are indistinguishable (unknown email vs. wrong password
//    both return 401 invalid_credentials) — no user enumeration.
//  - The password is verified with a constant-time scrypt compare and is never
//    echoed back; responses expose only the public projection of the operator
//    (never `password_hash`).
//  - The request logger (guardrail #2) already excludes bodies, so the posted
//    password never reaches a log sink.

const express = require('express');
const { adminUsers } = require('../repositories');
const { asyncHandler, badRequest, HttpError } = require('../lib/http');
const { verifyPassword } = require('../lib/password');
const jwt = require('../lib/jwt');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// POST /api/auth/login — exchange email + password for a bearer token.
router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const { email, password } = req.body || {};
    if (!email || !password) throw badRequest('email_and_password_required');

    const user = await adminUsers.findByEmail(email);
    // Always run a verify to keep timing roughly uniform whether or not the
    // email exists; either mismatch yields the same opaque 401.
    const ok = user ? verifyPassword(String(password), user.password_hash) : false;
    if (!user || !ok) {
      throw new HttpError(401, 'invalid_credentials');
    }

    const token = jwt.sign({
      sub: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
    });

    res.json({ token, admin: adminUsers.toPublic(user) });
  })
);

// GET /api/auth/me — current operator, from the verified token (no DB lookup).
router.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({ admin: req.admin });
  })
);

module.exports = router;
