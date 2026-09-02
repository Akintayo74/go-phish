'use strict';

// Participant management API (Phase 2). CRUD over participants plus the
// individual opt-out / opt-in flow (guardrail #3, "opted-in"; guardrail #6,
// data minimization).
//
// The client posts a RAW contact identifier on create; the repository hashes it
// (src/lib/hash.js) so no raw email/phone is ever stored. The request logger
// (guardrail #2) already excludes bodies, so the raw identifier never reaches a
// log sink either. Responses expose only the stored keyed hash, never a raw
// address (there is none to expose).
//
// Authorization (mirrors routes/campaigns.js and routes/cohorts.js):
//  - Any authenticated operator may read the roster — role/department/opt-out
//    state is what a Researcher needs to read an aggregate report.
//  - Only a Program Admin may enrol, edit, delete, or move opt-out state, and
//    only a Program Admin may resolve an address to a participant (see
//    /lookup). These are the writes that change who can be contacted.

const express = require('express');
const { participants, cohorts } = require('../repositories');
const { asyncHandler, badRequest, notFound } = require('../lib/http');
const { requireRole } = require('../middleware/auth');
const { ROLES } = require('../lib/roles');

const router = express.Router();

async function loadParticipant(id) {
  const participant = await participants.findById(id);
  if (!participant) throw notFound('participant_not_found');
  return participant;
}

async function assertCohortExists(cohortId) {
  const cohort = await cohorts.findById(cohortId);
  if (!cohort) throw badRequest('cohort_not_found');
}

// --- Reads: any authenticated operator ------------------------------------

// List participants, optionally scoped to a cohort via ?cohort_id=.
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { cohort_id: cohortId } = req.query;
    const rows = cohortId
      ? await participants.query().where({ cohort_id: cohortId }).orderBy('created_at')
      : await participants.list();
    res.json({ data: rows });
  })
);

// Get one participant.
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const participant = await loadParticipant(req.params.id);
    res.json({ data: participant });
  })
);

// --- Writes (and identity resolution): Program Admin only ------------------
router.use(requireRole(ROLES.PROGRAM_ADMIN));

// Resolve a RAW contact identifier to the participant it was enrolled as.
//
// Participants are pseudonymous by construction (guardrail #6): the console can
// list a roster but cannot tell an operator WHICH row is the person who just
// emailed asking to be removed, because only a keyed hash is stored and the key
// lives on the server. Without this endpoint an individual opt-out — the one
// thing consent law makes non-negotiable — is unperformable except with a
// database client. So the raw address is hashed here, matched, and discarded.
//
// Deliberate choices:
//  * POST, not GET-with-a-query — a raw address in a query string would land in
//    a URL, and `path`-only logging (guardrail #2) protects bodies, not queries.
//  * The identifier is never echoed back, not even in the 404.
//  * The response is the ordinary participant row. It carries NO behavioural
//    data: this resolves identity for an opt-out, it does not answer "what did
//    this person do" (guardrail #5). Do not widen it to join `interactions`.
router.post(
  '/lookup',
  asyncHandler(async (req, res) => {
    const { identifier } = req.body || {};
    if (!identifier || String(identifier).trim() === '') {
      throw badRequest('identifier_required');
    }
    const participant = await participants.findByIdentifier(identifier);
    if (!participant) throw notFound('participant_not_found');
    res.json({ data: participant });
  })
);

// Create a participant from a raw identifier (hashed on write).
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { identifier, cohort_id: cohortId, role, department } = req.body || {};
    if (!identifier || String(identifier).trim() === '') {
      throw badRequest('identifier_required');
    }
    if (!cohortId) throw badRequest('cohort_id_required');
    await assertCohortExists(cohortId);

    let row;
    try {
      row = await participants.createFromIdentifier({
        identifier,
        cohort_id: cohortId,
        role: role !== undefined ? role : null,
        department: department !== undefined ? department : null,
      });
    } catch (err) {
      // Unique violation on email_or_phone_hash — this identifier is already
      // enrolled. Report a conflict without echoing the identifier.
      if (err && err.code === '23505') {
        const conflict = badRequest('participant_already_exists');
        conflict.status = 409;
        throw conflict;
      }
      throw err;
    }
    res.status(201).json({ data: row });
  })
);

// Update editable attributes. The identifier hash is immutable via this API
// (identity is fixed); opt-out state moves only through the endpoints below.
router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    await loadParticipant(req.params.id);
    const body = req.body || {};
    const attrs = {};
    if (body.role !== undefined) attrs.role = body.role;
    if (body.department !== undefined) attrs.department = body.department;
    if (body.cohort_id !== undefined) {
      await assertCohortExists(body.cohort_id);
      attrs.cohort_id = body.cohort_id;
    }
    if (Object.keys(attrs).length === 0) throw badRequest('no_updatable_fields');
    const row = await participants.update(req.params.id, attrs);
    res.json({ data: row });
  })
);

// Delete a participant.
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    await loadParticipant(req.params.id);
    await participants.remove(req.params.id);
    res.status(204).end();
  })
);

// Individual opt-out. Idempotent: opting out an already-opted-out participant
// is a no-op success. Excludes them from all future delivery.
router.post(
  '/:id/opt-out',
  asyncHandler(async (req, res) => {
    await loadParticipant(req.params.id);
    const row = await participants.optOut(req.params.id);
    res.json({ data: row });
  })
);

// Reverse an individual opt-out. Does not affect cohort-level consent.
router.post(
  '/:id/opt-in',
  asyncHandler(async (req, res) => {
    await loadParticipant(req.params.id);
    const row = await participants.optIn(req.params.id);
    res.json({ data: row });
  })
);

module.exports = router;
