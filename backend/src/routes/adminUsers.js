'use strict';

// Admin-user management API (Phase 3). Program Admins provision operator
// accounts here; there is deliberately no public self-registration. Every
// route requires a valid session and the program_admin role.
//
// Responses always go through `adminUsers.toPublic`, so `password_hash` can
// never be serialized. The raw password is accepted only on create, hashed by
// the repository, and never echoed back.

const express = require('express');
const { adminUsers } = require('../repositories');
const { asyncHandler, badRequest, notFound } = require('../lib/http');
const { requireAuth, requireRole } = require('../middleware/auth');
const { ROLES, isValidRole } = require('../lib/roles');

const router = express.Router();

router.use(requireAuth, requireRole(ROLES.PROGRAM_ADMIN));

// List operator accounts (never exposes hashes).
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const rows = await adminUsers.list();
    res.json({ data: rows.map(adminUsers.toPublic) });
  })
);

// Create a new operator account.
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { email, password, role, name } = req.body || {};
    if (!email || String(email).trim() === '') throw badRequest('email_required');
    if (!password || String(password).length < 8) {
      throw badRequest('password_min_length_8');
    }
    if (!isValidRole(role)) throw badRequest('invalid_role');

    let row;
    try {
      row = await adminUsers.createWithPassword({
        email,
        password: String(password),
        role,
        name: name !== undefined ? name : null,
      });
    } catch (err) {
      // Unique violation on email — account already exists.
      if (err && err.code === '23505') {
        const conflict = badRequest('admin_already_exists');
        conflict.status = 409;
        throw conflict;
      }
      throw err;
    }
    res.status(201).json({ data: adminUsers.toPublic(row) });
  })
);

// Get one operator account.
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const row = await adminUsers.findById(req.params.id);
    if (!row) throw notFound('admin_not_found');
    res.json({ data: adminUsers.toPublic(row) });
  })
);

module.exports = router;
