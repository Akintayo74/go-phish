'use strict';

// Campaign delivery (Phase 5) — GUARDRAIL-CRITICAL.
//
// This is the one place that turns a consented target list into sent simulation
// emails. It enforces two guardrails on every send:
//
//   • GUARDRAIL #3 (consent-gated delivery): every recipient is run through the
//     single `isDeliverable` predicate from services/consent.js. A participant
//     whose cohort consent is not granted, or who has individually opted out, is
//     NEVER handed to the mailer. There is no code path that sends around the
//     predicate — the named test tests/delivery.guardrail.test.js pins this.
//
//   • GUARDRAIL #6 (data minimization): the system stores only a keyed HASH of a
//     participant's address (see participants migration), never the raw address.
//     So the caller supplies the raw addresses transiently at SEND TIME; we hash
//     each to match a stored participant, use the address ONLY as the mail `to`,
//     and never persist it. Nothing raw is written to any table or log.
//
// The tracked link embedded in the email is `${publicBaseUrl}/t/<token>` — the
// Phase 5 tracking route that flips `clicked` and redirects to the Phase 4
// decoy page.

const config = require('../config');
const { campaigns, participants, cohorts, interactions } = require('../repositories');
const { isDeliverable, ineligibilityReason } = require('./consent');
const { normalizeIdentifier } = require('../lib/hash');
const { renderSimulationEmail } = require('../views/emailTemplates');
const { createMailer } = require('./mailer');
const { HttpError, notFound } = require('../lib/http');

const TRACK_MOUNT = '/t';

function buildTrackingUrl(token, base = config.publicBaseUrl) {
  return `${base}${TRACK_MOUNT}/${encodeURIComponent(token)}`;
}

function buildPixelUrl(token, base = config.publicBaseUrl) {
  return `${base}${TRACK_MOUNT}/${encodeURIComponent(token)}/pixel.gif`;
}

function realSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Sends a campaign to the supplied recipient addresses. Returns an AGGREGATE
// summary only — counts per outcome, never a per-address result — so an
// operational send receipt cannot become a per-individual leak (guardrail #5).
//
// Options:
//   campaignId  – the campaign to send (must exist and be `active`).
//   recipients  – array of raw contact identifiers (email addresses) held by
//                 the admin/roster. Deduped; never persisted.
//   resend      – if true, re-send to targets that already have an interaction
//                 row (reuses their existing token). Default false.
//   mailer      – injectable provider (defaults to the configured one).
//   throttleMs  – delay between sends; defaults from config.sendRatePerSecond.
//   sleep       – injectable delay fn (tests pass a no-op).
async function sendCampaign({
  campaignId,
  recipients,
  resend = false,
  mailer,
  throttleMs,
  sleep = realSleep,
  repos = { campaigns, participants, cohorts, interactions },
} = {}) {
  const campaign = await repos.campaigns.findById(campaignId);
  if (!campaign) throw notFound('campaign_not_found');
  // A campaign only sends while active. draft/paused/completed/archived all
  // refuse — this respects the pause/rollback guardrail (Phase 11) here too.
  if (campaign.status !== 'active') {
    throw new HttpError(409, `cannot_send_from_${campaign.status}`);
  }

  if (!Array.isArray(recipients) || recipients.length === 0) {
    throw new HttpError(400, 'recipients_required');
  }

  const transport = mailer || createMailer();
  const delayMs =
    throttleMs !== undefined
      ? throttleMs
      : config.sendRatePerSecond > 0
        ? Math.round(1000 / config.sendRatePerSecond)
        : 0;

  // Dedupe by normalized identifier so a repeated address is contacted once.
  const seen = new Set();
  const summary = {
    campaign_id: campaign.id,
    total: 0,
    sent: 0,
    skipped: { unknown: 0, not_deliverable: 0, already_sent: 0 },
    failed: 0,
    ineligible_reasons: {},
  };

  for (const raw of recipients) {
    if (raw === undefined || raw === null || String(raw).trim() === '') continue;
    const key = normalizeIdentifier(raw);
    if (seen.has(key)) continue;
    seen.add(key);
    summary.total += 1;

    // Match the raw address to a stored participant via its keyed hash.
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

    // One interaction (and one token) per (campaign, participant). Reuse an
    // existing row so a re-send keeps the same link; skip unless `resend`.
    let interaction = await repos.interactions.findByCampaignAndParticipant(
      campaign.id,
      participant.id
    );
    if (interaction && !resend) {
      summary.skipped.already_sent += 1;
      continue;
    }
    if (!interaction) {
      interaction = await repos.interactions.createForTarget({
        campaign_id: campaign.id,
        participant_id: participant.id,
      });
    }

    const trackingUrl = buildTrackingUrl(interaction.tracking_token);
    const pixelUrl = buildPixelUrl(interaction.tracking_token);
    const { subject, html, text } = renderSimulationEmail({
      brandName: config.simBrandName,
      trackingUrl,
      pixelUrl,
    });

    try {
      // `raw` is used ONLY as the mail recipient here and is never persisted.
      await transport.send({ to: raw, subject, html, text });
      summary.sent += 1;
    } catch (_err) {
      // Never surface the provider error verbatim (could echo the address).
      summary.failed += 1;
    }

    if (delayMs > 0) await sleep(delayMs);
  }

  return summary;
}

module.exports = { sendCampaign, buildTrackingUrl, buildPixelUrl, TRACK_MOUNT };
