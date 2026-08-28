'use strict';

// Campaign repository (Phase 3). Wraps the base factory and adds the lifecycle
// transition helper. Like cohort consent, a campaign's `status` is never set
// through create/update — it moves only via explicit transitions, so the state
// machine lives in one auditable place (routes/campaigns.js drives it).

const { createRepository } = require('./base');

const repo = createRepository('campaigns');

async function setStatus(id, status, trx) {
  return repo.update(id, { status }, trx);
}

module.exports = {
  ...repo,
  setStatus,
};
