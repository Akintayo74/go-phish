'use strict';

// ============================================================================
// GUARDRAIL TEST (named, explicit) — consent-gated delivery (guardrail #3).
// ============================================================================
// A participant may be contacted by a simulation ONLY when their cohort's
// consent is granted AND they have not individually opted out. This test pins
// the full truth table of the single predicate (`isDeliverable`) that all
// future delivery/enrollment code must route through. It runs WITHOUT a
// database. If a change ever makes a non-consented or opted-out target
// deliverable, this test fails the build. Do not weaken it.
// ============================================================================

const {
  isDeliverable,
  isCohortConsented,
  ineligibilityReason,
} = require('../src/services/consent');

const grantedCohort = { id: 'c1', consent_status: 'granted' };
const pendingCohort = { id: 'c2', consent_status: 'pending' };
const withdrawnCohort = { id: 'c3', consent_status: 'withdrawn' };

const optedIn = { id: 'p1', opted_out: false };
const optedOut = { id: 'p2', opted_out: true };

describe('consent-gated delivery guardrail', () => {
  test('deliverable ONLY when cohort consent granted AND participant not opted out', () => {
    // The one and only true case.
    expect(isDeliverable(optedIn, grantedCohort)).toBe(true);

    // Every other combination must be false.
    expect(isDeliverable(optedOut, grantedCohort)).toBe(false); // opted out
    expect(isDeliverable(optedIn, pendingCohort)).toBe(false); // not yet consented
    expect(isDeliverable(optedIn, withdrawnCohort)).toBe(false); // consent withdrawn
    expect(isDeliverable(optedOut, pendingCohort)).toBe(false);
    expect(isDeliverable(optedOut, withdrawnCohort)).toBe(false);
  });

  test('fails closed on missing / malformed inputs', () => {
    expect(isDeliverable(null, grantedCohort)).toBe(false);
    expect(isDeliverable(optedIn, null)).toBe(false);
    expect(isDeliverable(undefined, undefined)).toBe(false);
    // A cohort with no consent field is not consented by omission.
    expect(isDeliverable(optedIn, { id: 'x' })).toBe(false);
    // opted_out defaulting to a truthy value is treated as opted out.
    expect(isDeliverable({ id: 'p', opted_out: true }, grantedCohort)).toBe(false);
  });

  test('only "granted" counts as cohort consent', () => {
    expect(isCohortConsented(grantedCohort)).toBe(true);
    expect(isCohortConsented(pendingCohort)).toBe(false);
    expect(isCohortConsented(withdrawnCohort)).toBe(false);
    expect(isCohortConsented(null)).toBe(false);
  });

  test('ineligibilityReason names the blocking cause and is null when deliverable', () => {
    expect(ineligibilityReason(optedIn, grantedCohort)).toBeNull();
    expect(ineligibilityReason(optedOut, grantedCohort)).toBe('participant_opted_out');
    expect(ineligibilityReason(optedIn, pendingCohort)).toBe('cohort_consent_not_granted');
    expect(ineligibilityReason(optedIn, withdrawnCohort)).toBe('cohort_consent_not_granted');
    expect(ineligibilityReason(null, grantedCohort)).toBe('participant_not_found');
    expect(ineligibilityReason(optedIn, null)).toBe('cohort_not_found');
  });
});
