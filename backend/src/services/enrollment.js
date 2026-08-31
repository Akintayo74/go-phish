'use strict';

// ============================================================================
// PHASE 8 — Automatic enrollment loop.
// ============================================================================
//
// This service closes the loop between "measured vulnerability" and "targeted
// education": when a participant meets a campaign's enrollment trigger (they
// clicked the tracked link, or — stricter — submitted the dummy form), they are
// automatically enrolled into awareness training.
//
//   interaction event  →  enrollFromInteraction  →  training_assignment
//                                                     (+ opaque completion token)
//
// The pieces:
//   • enrollFromInteraction   – the trigger→assignment core (idempotent).
//   • safeEnrollFromInteraction – best-effort wrapper for participant-facing
//     routes: enrollment must NEVER break the click/submit flow or the
//     guaranteed disclosure (guardrail #4).
//   • notifyEnrollments       – admin-triggered "notify by email". Because the
//     system stores only a keyed HASH of a contact address (guardrail #6), the
//     raw roster is supplied transiently here, exactly like Phase 5 delivery;
//     nothing raw is persisted, and the response is an aggregate summary only
//     (guardrail #5).
//   • nextResimulationDate    – the optional re-simulation scheduling hook.
//
// GUARDRAIL #1: an assignment records only WHY a participant was enrolled
// (`clicked_link` / `submitted_form`) — never a submitted value. The repo has
// no column or method for one.

const config = require('../config');
const {
  campaigns,
  participants,
  cohorts,
  learningModules,
  trainingAssignments,
} = require('../repositories');
const { isDeliverable, ineligibilityReason } = require('./consent');
const { renderEnrollmentEmail } = require('../views/emailTemplates');
const { createMailer } = require('./mailer');
const { HttpError, notFound } = require('../lib/http');

// Assignment reasons — kept in sync with the training_assignments migration
// comment. `submitted_form` is the stronger signal and takes precedence.
const REASON_SUBMITTED = 'submitted_form';
const REASON_CLICKED = 'clicked_link';

// Does an interaction meet a campaign's configured enrollment strictness?
//   trigger 'submitted' → only a form submit enrolls.
//   trigger 'clicked'   → a click (or the stronger submit) enrolls.
function meetsTrigger(campaign, interaction) {
  if (!campaign || !interaction) return false;
  if (interaction.submitted) return true; // a submit always counts
  if (campaign.enrollment_trigger === 'clicked') return Boolean(interaction.clicked);
  return false;
}

// The reason to stamp on the assignment, from the interaction's flags.
function assignedReasonFor(interaction) {
  return interaction && interaction.submitted ? REASON_SUBMITTED : REASON_CLICKED;
}

// Core loop step. Given an interaction that was just marked clicked/submitted,
// create (idempotently) the training assignment if the campaign's trigger is
// met. Returns a small result describing what happened. Idempotent: a repeat
// event re-uses the existing assignment (backed by the unique constraint on
// (participant, module, campaign)).
async function enrollFromInteraction(
  interaction,
  { repos = { campaigns, learningModules, trainingAssignments }, moduleSlug = config.enrollmentModuleSlug } = {}
) {
  if (!interaction || !interaction.campaign_id || !interaction.participant_id) {
    return { enrolled: false, reason: 'no_interaction' };
  }

  const campaign = await repos.campaigns.findById(interaction.campaign_id);
  if (!campaign) return { enrolled: false, reason: 'campaign_not_found' };

  // Phase 11 — pause/rollback defense-in-depth. A paused (non-active) campaign
  // enrolls no one new. The participant-facing routes already gate on this
  // (services/campaignState.js); enforcing it here too means no enrollment can
  // be created for a halted campaign even via a direct call. Fail-open on an
  // absent status so a partial campaign row (or an older caller that omits it)
  // is not silently dropped — the route gate remains the primary control.
  if (campaign.status && campaign.status !== 'active') {
    return { enrolled: false, reason: 'campaign_not_active' };
  }

  if (!meetsTrigger(campaign, interaction)) {
    return { enrolled: false, reason: 'trigger_not_met' };
  }

  // Resolve the training module to assign. Only a PUBLISHED module is assignable
  // — fail safe rather than pointing a participant at invisible content.
  const module = await repos.learningModules.findPublishedBySlug(moduleSlug);
  if (!module) return { enrolled: false, reason: 'module_unavailable' };

  const key = {
    participant_id: interaction.participant_id,
    learning_module_id: module.id,
    campaign_id: interaction.campaign_id,
  };

  const existing = await repos.trainingAssignments.findExisting(key);
  if (existing) return { enrolled: true, created: false, assignment: existing };

  try {
    const assignment = await repos.trainingAssignments.createForEnrollment({
      ...key,
      assigned_reason: assignedReasonFor(interaction),
    });
    return { enrolled: true, created: true, assignment };
  } catch (err) {
    // Race backstop: two concurrent events for the same target hit the unique
    // constraint. Re-read and return the row that won rather than surfacing the
    // violation to a participant-facing route.
    const raced = await repos.trainingAssignments.findExisting(key);
    if (raced) return { enrolled: true, created: false, assignment: raced };
    throw err;
  }
}

// Best-effort wrapper for the participant-facing tracking/sim routes. Enrollment
// is a side effect of the participant's action; it must never throw back into
// (and break) the click/submit response or the disclosure guarantee. Any failure
// is swallowed — the assignment can be reconciled later; the participant flow is
// never interrupted.
async function safeEnrollFromInteraction(interaction, opts) {
  try {
    return await enrollFromInteraction(interaction, opts);
  } catch (_err) {
    return { enrolled: false, reason: 'error' };
  }
}

// The optional re-simulation scheduling hook. Once a participant completes their
// assigned training, recommend when to re-test them. Advisory only: returns the
// recommended Date (or null if not yet completed / no basis) — nothing is
// dispatched automatically, consistent with the system storing no roster.
function nextResimulationDate(assignment, { intervalDays = config.resimulationIntervalDays } = {}) {
  if (!assignment || !assignment.completed_at) return null;
  const base = new Date(assignment.completed_at);
  if (Number.isNaN(base.getTime())) return null;
  const days = Number.isFinite(intervalDays) ? intervalDays : 90;
  return new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
}

// Admin-triggered notification. Emails participants that they have been enrolled
// in training, with a tokened link to complete it. GUARDRAIL-CRITICAL, mirroring
// Phase 5 delivery:
//   • data minimization (guardrail #6): the raw addresses are supplied
//     transiently by the admin, hashed to match a stored participant, used ONLY
//     as the mail `to`, and NEVER persisted;
//   • consent gate (guardrail #3): an opted-out / non-consented participant is
//     never emailed (same single predicate as delivery);
//   • aggregate-only (guardrail #5): the return value is counts, never a
//     per-individual/per-address result.
async function notifyEnrollments({
  campaignId,
  recipients,
  mailer,
  repos = { campaigns, participants, cohorts, learningModules, trainingAssignments },
  buildTrainingUrl = defaultTrainingUrl,
  brandName = config.simBrandName,
} = {}) {
  const campaign = await repos.campaigns.findById(campaignId);
  if (!campaign) throw notFound('campaign_not_found');

  if (!Array.isArray(recipients) || recipients.length === 0) {
    throw new HttpError(400, 'recipients_required');
  }

  const transport = mailer || createMailer();
  const seen = new Set();
  const summary = {
    campaign_id: campaign.id,
    total: 0,
    notified: 0,
    skipped: { unknown: 0, not_deliverable: 0, no_assignment: 0, already_notified: 0 },
    failed: 0,
    ineligible_reasons: {},
  };

  for (const raw of recipients) {
    if (raw === undefined || raw === null || String(raw).trim() === '') continue;
    const key = String(raw).trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    summary.total += 1;

    const participant = await repos.participants.findByIdentifier(raw);
    if (!participant) {
      summary.skipped.unknown += 1;
      continue;
    }

    // Consent gate — the single predicate. Fail closed.
    const cohort = await repos.cohorts.findById(participant.cohort_id);
    if (!isDeliverable(participant, cohort)) {
      summary.skipped.not_deliverable += 1;
      const reason = ineligibilityReason(participant, cohort) || 'not_deliverable';
      summary.ineligible_reasons[reason] = (summary.ineligible_reasons[reason] || 0) + 1;
      continue;
    }

    const assignments = await repos.trainingAssignments.listByCampaignAndParticipant(
      campaign.id,
      participant.id
    );
    // Notify only assignments not yet completed and not already notified.
    const pending = (assignments || []).filter(
      (a) => a.status !== 'completed' && !a.notified_at
    );
    if (!assignments || assignments.length === 0) {
      summary.skipped.no_assignment += 1;
      continue;
    }
    if (pending.length === 0) {
      summary.skipped.already_notified += 1;
      continue;
    }

    // One email per participant, linking to their (first pending) assignment.
    const assignment = pending[0];
    const module = await repos.learningModules.findById(assignment.learning_module_id);
    const { subject, html, text } = renderEnrollmentEmail({
      brandName,
      trainingUrl: buildTrainingUrl(assignment.completion_token),
      moduleTitle: module && module.title,
    });

    try {
      // `raw` is used ONLY as the mail recipient here and is never persisted.
      await transport.send({ to: raw, subject, html, text });
      // Persist ONLY the notified timestamp — never the address.
      for (const a of pending) {
        await repos.trainingAssignments.markNotified(a.id);
      }
      summary.notified += 1;
    } catch (_err) {
      summary.failed += 1;
    }
  }

  return summary;
}

// The participant-facing training link the notification points at. The frontend
// serves the enroll view at the `#/enroll/<token>` hash route, which loads the
// assignment via GET /api/enroll/:token.
function defaultTrainingUrl(token) {
  return `${config.publicBaseUrl}/#/enroll/${encodeURIComponent(token)}`;
}

module.exports = {
  meetsTrigger,
  assignedReasonFor,
  enrollFromInteraction,
  safeEnrollFromInteraction,
  nextResimulationDate,
  notifyEnrollments,
  defaultTrainingUrl,
  REASON_SUBMITTED,
  REASON_CLICKED,
};
