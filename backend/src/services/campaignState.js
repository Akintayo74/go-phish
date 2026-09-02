'use strict';

// ============================================================================
// PHASE 11 — Campaign pause / rollback gate.
// ============================================================================
//
// A campaign's lifecycle status (draft → active → paused/completed → archived,
// see routes/campaigns.js) is the operator's control for HALTING a running
// simulation. Phase 5 already refuses to SEND from a non-active campaign; this
// module extends "active means live" to the participant-facing recording path so
// that pausing a campaign is a real rollback: while a campaign is not `active`,
//
//   • no NEW behavioral flag (opened/clicked/submitted/disclosed) is recorded
//     for its interactions, and
//   • no NEW training enrollment is triggered.
//
// Crucially, the participant-facing pages are UNCHANGED by a pause: the tracked
// link still redirects to the decoy, the decoy still renders, and — guardrail #4
// (transparency) — the disclosure page still shows. Pausing stops DATA
// COLLECTION and the enrollment side effect, never the guarantees owed to a
// participant who already received a real email.
//
// FAIL-OPEN, by design and only here. This gate governs behavioral FLAGS —
// click/open booleans — not the legal-safety guardrails. Guardrails #1 (no
// credentials), #3 (consent), #5 (aggregate-only), #6 (data minimization) are
// enforced elsewhere and all fail CLOSED. This gate instead errs toward
// recording when it cannot positively confirm a halt (an unreadable campaign, a
// row with no campaign link), so a transient lookup hiccup never silently drops a
// legitimately-active campaign's measurement. A halt is only applied when the
// campaign is present and positively reports a non-active status.

const { campaigns } = require('../repositories');

const LIVE_STATUS = 'active';

// Pure predicate: is this campaign row live (sending/recording/enrolling)?
// A missing campaign or a non-active status is not live.
function isCampaignLive(campaign) {
  return Boolean(campaign) && campaign.status === LIVE_STATUS;
}

// Should NEW behavioral data / enrollment for this interaction be halted because
// its campaign is paused (or otherwise not active)? Fail-open (see header): only
// a campaign we can read AND that positively reports a non-active status halts.
async function isRecordingHalted(interaction, { repos = { campaigns } } = {}) {
  try {
    if (!interaction || !interaction.campaign_id) return false;
    const campaign = await repos.campaigns.findById(interaction.campaign_id);
    // Unknown campaign → cannot confirm a halt → do not drop data (fail-open).
    if (!campaign) return false;
    // Present, with a status: halt iff it is not the live/active status.
    if (!campaign.status) return false;
    return campaign.status !== LIVE_STATUS;
  } catch (_err) {
    // Never let the gate itself break a participant-facing request.
    return false;
  }
}

module.exports = { isCampaignLive, isRecordingHalted, LIVE_STATUS };
