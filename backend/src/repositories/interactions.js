'use strict';

// Interaction repository. The mutation surface is intentionally narrow: only
// behavioral flags and timestamps can be set. There is no method — and no
// column — for storing submitted form values (guardrail #1). `markSubmitted`
// takes NO value argument by design.

const { createRepository } = require('./base');
const { generateToken } = require('../lib/token');

const repo = createRepository('interactions');

async function findByToken(tracking_token, trx) {
  return repo.findWhere({ tracking_token }, trx);
}

// One interaction row per (campaign, participant) — enforced by a UNIQUE
// constraint. Delivery looks a target up here before minting a new one so a
// re-send reuses the same tracking token rather than orphaning the old link.
async function findByCampaignAndParticipant(campaign_id, participant_id, trx) {
  return repo.findWhere({ campaign_id, participant_id }, trx);
}

// Mints the tracked-link token and creates the interaction row for a target.
// Only routing/behavioral fields are written — there is no path here for a
// submitted value (guardrail #1). The token is generated server-side, never
// taken from a caller.
async function createForTarget({ campaign_id, participant_id }, trx) {
  return repo.create(
    { campaign_id, participant_id, tracking_token: generateToken() },
    trx
  );
}

async function markOpened(id, at = new Date(), trx) {
  return repo.update(id, { opened: true, opened_at: at }, trx);
}

async function markClicked(id, at = new Date(), trx) {
  // Clicking implies the email was opened.
  return repo.update(id, { opened: true, clicked: true, clicked_at: at }, trx);
}

// Records THAT the dummy form was submitted. Deliberately accepts no field
// values — the form handler discards them.
async function markSubmitted(id, at = new Date(), trx) {
  return repo.update(id, { submitted: true, submitted_at: at }, trx);
}

async function markDisclosed(id, at = new Date(), trx) {
  return repo.update(id, { disclosed: true, disclosed_at: at }, trx);
}

module.exports = {
  ...repo,
  findByToken,
  findByCampaignAndParticipant,
  createForTarget,
  markOpened,
  markClicked,
  markSubmitted,
  markDisclosed,
};
