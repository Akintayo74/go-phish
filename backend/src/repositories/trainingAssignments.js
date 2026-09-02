'use strict';

// Training-assignment repository (Phase 8 — automatic enrollment loop).
//
// A training assignment is the output of the enrollment loop: when a participant
// clicks/submits (per the campaign's `enrollment_trigger`) a row is created here
// linking them to a learning module and recording WHY. This is the one place
// per-individual linkage is intentional (see the table's migration comment);
// every management/researcher-facing view stays aggregate-only (guardrail #5).
//
// Like the other guardrail-aware repos, the mutation surface is narrow: only
// routing fields, the assignment reason, and status/timestamps can be written.
// There is no column — and no method — for a submitted credential or form value
// (guardrail #1); the assignment simply records THAT a participant was enrolled.

const { createRepository } = require('./base');
const { generateToken } = require('../lib/token');
const { db } = require('../db');

const repo = createRepository('training_assignments');

// Creates the assignment and mints its opaque completion token. The token is
// generated server-side (never taken from a caller) and lets the participant
// reach and complete their assigned training without a login — the CAT site is
// otherwise anonymous. Only routing/reason fields are written.
async function createForEnrollment(
  { participant_id, learning_module_id, campaign_id, assigned_reason },
  trx
) {
  return repo.create(
    {
      participant_id,
      learning_module_id,
      campaign_id,
      assigned_reason,
      completion_token: generateToken(),
    },
    trx
  );
}

async function findByToken(completion_token, trx) {
  if (!completion_token) return undefined;
  return repo.findWhere({ completion_token }, trx);
}

// Idempotency backstop for the loop: an assignment is unique per
// (participant, module, campaign) at the schema level. The loop checks this
// before inserting so a repeat click/submit re-uses the existing assignment
// rather than erroring on the unique constraint.
async function findExisting({ participant_id, learning_module_id, campaign_id }, trx) {
  return repo.findWhere({ participant_id, learning_module_id, campaign_id }, trx);
}

// All of a participant's assignments for a campaign (used by the admin-triggered
// notification: match a supplied address → participant → their assignments).
async function listByCampaignAndParticipant(campaign_id, participant_id, trx) {
  return repo.query(trx).where({ campaign_id, participant_id }).orderBy('assigned_at', 'asc');
}

// Viewing the assigned training moves an untouched assignment to in_progress.
// Only advances from the initial state so it never walks a completed row back;
// returns undefined when the row was already past 'assigned'.
async function markInProgress(id, trx) {
  const conn = trx || db;
  const [row] = await conn('training_assignments')
    .where({ id, status: 'assigned' })
    .update({ status: 'in_progress', updated_at: conn.fn.now() })
    .returning('*');
  return row;
}

async function markCompleted(id, at = new Date(), trx) {
  return repo.update(id, { status: 'completed', completed_at: at }, trx);
}

async function markNotified(id, at = new Date(), trx) {
  return repo.update(id, { notified_at: at }, trx);
}

// Participant-facing projection for the tokened enroll routes. Deliberately
// omits participant_id and the completion_token itself — the caller already
// holds the token, and the participant id is never echoed back.
function toPublic(row) {
  if (!row) return row;
  return {
    status: row.status,
    assigned_reason: row.assigned_reason,
    assigned_at: row.assigned_at,
    completed_at: row.completed_at,
    learning_module_id: row.learning_module_id,
    campaign_id: row.campaign_id,
  };
}

module.exports = {
  ...repo,
  createForEnrollment,
  findByToken,
  findExisting,
  listByCampaignAndParticipant,
  markInProgress,
  markCompleted,
  markNotified,
  toPublic,
};
