'use strict';

// Participant repository. Callers pass a raw email/phone; it is hashed here so
// no raw contact identifier ever reaches the database (guardrail #6).

const { createRepository } = require('./base');
const { hashIdentifier } = require('../lib/hash');

const repo = createRepository('participants');

async function createFromIdentifier({ identifier, cohort_id, role, department }, trx) {
  return repo.create(
    {
      cohort_id,
      role,
      department,
      email_or_phone_hash: hashIdentifier(identifier),
    },
    trx
  );
}

async function findByIdentifier(identifier, trx) {
  return repo.findWhere({ email_or_phone_hash: hashIdentifier(identifier) }, trx);
}

async function optOut(id, at = new Date(), trx) {
  return repo.update(id, { opted_out: true, opted_out_at: at }, trx);
}

// Reverses an individual opt-out (e.g. the participant re-consents). Clears the
// flag and the timestamp; cohort-level consent is unaffected.
async function optIn(id, trx) {
  return repo.update(id, { opted_out: false, opted_out_at: null }, trx);
}

module.exports = {
  ...repo,
  createFromIdentifier,
  findByIdentifier,
  optOut,
  optIn,
};
