'use strict';

// Analytics data-access (Phase 9). GUARDRAIL-AWARE (guardrail #5, aggregate-only).
//
// These queries feed the aggregate analytics service. They deliberately select
// ONLY the group dimension (cohort name / department) and the behavioral flags
// (or an assignment status) — never a participant id, hash, or any identifier.
// The service groups and counts them; nothing per-individual is fetched, let
// alone emitted. Because no identifying column ever crosses this boundary, an
// analytics leak of a per-person result is impossible by construction.
//
// One row per interaction/assignment IS pulled into memory here (rather than
// aggregating in SQL) so the whole four-tier + suppression + rate logic lives in
// one auditable, unit-testable place (services/analytics.js). This is MVP scale
// by design — org-wide scale is explicitly deferred past the MVP.

const { db } = require('../db');

// One lightweight record per targeted interaction in the campaign: the group
// dimensions + the four behavioral flags. No participant identifier is selected.
async function interactionFlagsByCampaign(campaign_id, trx) {
  const conn = trx || db;
  return conn('interactions')
    .join('participants', 'interactions.participant_id', 'participants.id')
    .leftJoin('cohorts', 'participants.cohort_id', 'cohorts.id')
    .where('interactions.campaign_id', campaign_id)
    .select(
      'cohorts.name as cohort',
      'participants.department as department',
      'interactions.opened as opened',
      'interactions.clicked as clicked',
      'interactions.submitted as submitted'
    );
}

// One lightweight record per training assignment the campaign's enrollment loop
// created: the group dimensions + the assignment status. No participant id.
async function assignmentStatusByCampaign(campaign_id, trx) {
  const conn = trx || db;
  return conn('training_assignments')
    .join('participants', 'training_assignments.participant_id', 'participants.id')
    .leftJoin('cohorts', 'participants.cohort_id', 'cohorts.id')
    .where('training_assignments.campaign_id', campaign_id)
    .select(
      'cohorts.name as cohort',
      'participants.department as department',
      'training_assignments.status as status'
    );
}

module.exports = { interactionFlagsByCampaign, assignmentStatusByCampaign };
