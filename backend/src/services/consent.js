'use strict';

// Consent service — GUARDRAIL-CRITICAL (guardrail #3, "consent-gated delivery").
//
// Consent is the load-bearing precondition for any future delivery. Phase 2
// builds and manages consent state; Phases 5/8 (delivery, enrollment) MUST
// route every targeting decision through the single predicate defined here so
// there is exactly one place that decides "may this participant be contacted".
//
// A participant is DELIVERABLE only when BOTH hold:
//   1. their cohort's consent_status === 'granted' (group-level consent), and
//   2. the participant has NOT individually opted out.
//
// The core predicate `isDeliverable` is a pure function (no DB), so it can be
// unit-tested exhaustively and reused anywhere. `deliverableParticipants` is
// the DB-backed counterpart delivery will call to enumerate valid targets.

const { db } = require('../db');

const GRANTED = 'granted';

// True iff the cohort has active, un-withdrawn consent.
function isCohortConsented(cohort) {
  return !!cohort && cohort.consent_status === GRANTED;
}

// The single source of truth for "may we contact this participant". Fail
// closed: any missing input, un-granted cohort, or individual opt-out returns
// false. Never returns true by omission.
function isDeliverable(participant, cohort) {
  if (!participant || !cohort) return false;
  if (participant.opted_out === true) return false;
  return isCohortConsented(cohort);
}

// Human-readable reason a participant is NOT deliverable (for admin UIs and
// pre-send checks). Returns null when the participant IS deliverable.
function ineligibilityReason(participant, cohort) {
  if (!participant) return 'participant_not_found';
  if (!cohort) return 'cohort_not_found';
  if (participant.opted_out === true) return 'participant_opted_out';
  if (!isCohortConsented(cohort)) return 'cohort_consent_not_granted';
  return null;
}

// DB-backed enumeration of the deliverable participants in a cohort. Returns []
// unless the cohort's consent is currently granted; excludes opted-out members.
// Delivery (Phase 5) uses this so a non-consented or opted-out target can never
// be enumerated as a send candidate in the first place.
async function deliverableParticipants(cohortId, conn = db) {
  const cohort = await conn('cohorts').where({ id: cohortId }).first();
  if (!isCohortConsented(cohort)) return [];
  return conn('participants')
    .where({ cohort_id: cohortId, opted_out: false })
    .orderBy('created_at');
}

module.exports = {
  GRANTED,
  isCohortConsented,
  isDeliverable,
  ineligibilityReason,
  deliverableParticipants,
};
