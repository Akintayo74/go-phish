'use strict';

// Campaign management API (Phase 3). CRUD skeleton + lifecycle transitions.
// NO SENDING happens here — delivery is Phase 5. Activating a campaign only
// flips its status; nothing is dispatched to any participant.
//
// Authorization:
//  - Any authenticated operator may read (list/get).
//  - Only a Program Admin may create, edit, delete, or change lifecycle state.
//    Researchers/Evaluators are read-only here (their work is analytics).
//
// Like cohort consent, `status` is never settable through create/update — it
// moves only through the explicit transition endpoints, which enforce a small
// state machine so illegal jumps (e.g. reviving an archived campaign) 409
// rather than silently corrupting state.

const express = require('express');
const { campaigns } = require('../repositories');
const { asyncHandler, badRequest, notFound, HttpError } = require('../lib/http');
const { requireAuth, requireRole } = require('../middleware/auth');
const { ROLES } = require('../lib/roles');

const router = express.Router();

const ENROLLMENT_TRIGGERS = ['clicked', 'submitted'];

// Legal status transitions. `archived` is reachable from any live state and is
// terminal. `draft` is the only creatable state (schema default).
const TRANSITIONS = {
  draft: ['active', 'archived'],
  active: ['paused', 'completed', 'archived'],
  paused: ['active', 'completed', 'archived'],
  completed: ['archived'],
  archived: [],
};

// Only these fields are writable via the API; `status` is excluded on purpose.
function pickWritable(body = {}) {
  const attrs = {};
  if (body.name !== undefined) attrs.name = String(body.name).trim();
  if (body.description !== undefined) {
    attrs.description = body.description === null ? null : String(body.description);
  }
  if (body.phase_label !== undefined) {
    attrs.phase_label = body.phase_label === null ? null : String(body.phase_label);
  }
  if (body.enrollment_trigger !== undefined) {
    attrs.enrollment_trigger = body.enrollment_trigger;
  }
  if (body.scheduled_send_at !== undefined) {
    attrs.scheduled_send_at = body.scheduled_send_at;
  }
  return attrs;
}

function validateEnrollmentTrigger(value) {
  if (value !== undefined && !ENROLLMENT_TRIGGERS.includes(value)) {
    throw badRequest('invalid_enrollment_trigger');
  }
}

async function loadCampaign(id) {
  const campaign = await campaigns.findById(id);
  if (!campaign) throw notFound('campaign_not_found');
  return campaign;
}

// Drives one lifecycle transition, enforcing the state machine.
function transition(target) {
  return asyncHandler(async (req, res) => {
    const campaign = await loadCampaign(req.params.id);
    const allowed = TRANSITIONS[campaign.status] || [];
    if (!allowed.includes(target)) {
      throw new HttpError(409, `cannot_${target}_from_${campaign.status}`);
    }
    const row = await campaigns.setStatus(req.params.id, target);
    res.json({ data: row });
  });
}

// --- Reads: any authenticated operator ------------------------------------
router.use(requireAuth);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const rows = await campaigns.list();
    res.json({ data: rows });
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const campaign = await loadCampaign(req.params.id);
    res.json({ data: campaign });
  })
);

// --- Writes: Program Admin only -------------------------------------------
router.use(requireRole(ROLES.PROGRAM_ADMIN));

// Create a campaign. Always born 'draft' (schema default); status is not
// accepted here.
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const attrs = pickWritable(req.body);
    if (!attrs.name) throw badRequest('name_required');
    validateEnrollmentTrigger(attrs.enrollment_trigger);
    const row = await campaigns.create(attrs);
    res.status(201).json({ data: row });
  })
);

// Edit a campaign's metadata (not its status).
router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    await loadCampaign(req.params.id);
    const attrs = pickWritable(req.body);
    if (attrs.name !== undefined && !attrs.name) throw badRequest('name_required');
    validateEnrollmentTrigger(attrs.enrollment_trigger);
    if (Object.keys(attrs).length === 0) throw badRequest('no_updatable_fields');
    const row = await campaigns.update(req.params.id, attrs);
    res.json({ data: row });
  })
);

// Delete a campaign. Only a draft may be deleted; anything that has gone live
// is part of the research record and must be archived instead.
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const campaign = await loadCampaign(req.params.id);
    if (campaign.status !== 'draft') {
      throw new HttpError(409, 'only_draft_campaigns_deletable');
    }
    await campaigns.remove(req.params.id);
    res.status(204).end();
  })
);

// Lifecycle transitions.
router.post('/:id/activate', transition('active'));
router.post('/:id/pause', transition('paused'));
router.post('/:id/complete', transition('completed'));
router.post('/:id/archive', transition('archived'));

module.exports = router;
