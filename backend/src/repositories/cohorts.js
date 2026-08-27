'use strict';

// Cohort repository. Wraps the base factory and adds the consent state
// transitions (guardrail #3). Consent is cohort-level: granting/withdrawing
// here flips the flag that gates all delivery. Transitions also stamp the
// corresponding timestamp so the audit trail records when consent changed.

const { createRepository } = require('./base');

const repo = createRepository('cohorts');

async function grantConsent(id, at = new Date(), trx) {
  return repo.update(
    id,
    {
      consent_status: 'granted',
      consent_granted_at: at,
      // A fresh grant clears any prior withdrawal timestamp.
      consent_withdrawn_at: null,
    },
    trx
  );
}

async function withdrawConsent(id, at = new Date(), trx) {
  return repo.update(
    id,
    {
      consent_status: 'withdrawn',
      consent_withdrawn_at: at,
    },
    trx
  );
}

module.exports = {
  ...repo,
  grantConsent,
  withdrawConsent,
};
