'use strict';

// Cohort management API (Phase 2). CRUD over the consent unit plus the two
// consent transitions (grant / withdraw). Consent is what gates delivery
// (guardrail #3), so these endpoints are the front door to consent state.

const express = require('express');
const { cohorts } = require('../repositories');
const { asyncHandler, badRequest, notFound } = require('../lib/http');

const router = express.Router();

// Only these fields are writable via the API; consent_status is never set
// directly — it moves only through the grant/withdraw endpoints below.
function pickWritable(body = {}) {
  const attrs = {};
  if (body.name !== undefined) attrs.name = String(body.name).trim();
  if (body.description !== undefined) {
    attrs.description = body.description === null ? null : String(body.description);
  }
  return attrs;
}

async function loadCohort(id) {
  const cohort = await cohorts.findById(id);
  if (!cohort) throw notFound('cohort_not_found');
  return cohort;
}

// List cohorts.
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const rows = await cohorts.list();
    res.json({ data: rows });
  })
);

// Create a cohort. Always starts at consent_status = 'pending' (the schema
// default) — a cohort can never be born consented.
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const attrs = pickWritable(req.body);
    if (!attrs.name) throw badRequest('name_required');
    const row = await cohorts.create(attrs);
    res.status(201).json({ data: row });
  })
);

// Get one cohort.
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const cohort = await loadCohort(req.params.id);
    res.json({ data: cohort });
  })
);

// Update a cohort's editable metadata (not its consent status).
router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    await loadCohort(req.params.id);
    const attrs = pickWritable(req.body);
    if (attrs.name !== undefined && !attrs.name) throw badRequest('name_required');
    if (Object.keys(attrs).length === 0) throw badRequest('no_updatable_fields');
    const row = await cohorts.update(req.params.id, attrs);
    res.json({ data: row });
  })
);

// Delete a cohort. The participants FK is ON DELETE RESTRICT, so a cohort with
// members cannot be deleted — surface that as a clean 409 rather than a 500.
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    await loadCohort(req.params.id);
    try {
      await cohorts.remove(req.params.id);
    } catch (err) {
      if (err && err.code === '23503') {
        const conflict = badRequest('cohort_has_participants');
        conflict.status = 409;
        throw conflict;
      }
      throw err;
    }
    res.status(204).end();
  })
);

// Grant consent for the whole cohort. This is the transition that makes the
// cohort eligible to be targeted (subject to per-participant opt-out).
router.post(
  '/:id/consent/grant',
  asyncHandler(async (req, res) => {
    await loadCohort(req.params.id);
    const row = await cohorts.grantConsent(req.params.id);
    res.json({ data: row });
  })
);

// Withdraw consent. Immediately makes every participant in the cohort
// non-deliverable, regardless of individual opt-in state.
router.post(
  '/:id/consent/withdraw',
  asyncHandler(async (req, res) => {
    await loadCohort(req.params.id);
    const row = await cohorts.withdrawConsent(req.params.id);
    res.json({ data: row });
  })
);

module.exports = router;
