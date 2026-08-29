'use strict';

// Interaction repository. The mutation surface is intentionally narrow: only
// behavioral flags and timestamps can be set. There is no method — and no
// column — for storing submitted form values (guardrail #1). `markSubmitted`
// takes NO value argument by design.

const { createRepository } = require('./base');

const repo = createRepository('interactions');

async function findByToken(tracking_token, trx) {
  return repo.findWhere({ tracking_token }, trx);
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
  markOpened,
  markClicked,
  markSubmitted,
  markDisclosed,
};
