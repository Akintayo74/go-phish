'use strict';

// ============================================================================
// GUARDRAIL TEST (named, explicit) — consent-gated delivery + no persisted
// address (guardrails #3 and #6), enforced at the DELIVERY layer.
// ============================================================================
// Phase 5 is the first code that actually contacts a participant. This test
// pins two invariants of services/delivery.js and runs WITHOUT a database:
//
//   #3  Every recipient is routed through the single `isDeliverable` predicate.
//       A participant whose cohort consent is NOT granted, or who has opted out,
//       is NEVER handed to the mailer. If a change ever lets a non-consented or
//       opted-out target be emailed, this test fails the build.
//
//   #6  The raw recipient address is used ONLY as the mail `to`. It is never
//       written to any repository — the interaction row is created with routing
//       fields only, and no repo call receives the address or a hash of a form
//       value. Data minimization holds through the send path.
//
// Do not weaken this test.
// ============================================================================

const { sendCampaign } = require('../src/services/delivery');
const { hashIdentifier } = require('../src/lib/hash');

const grantedCohort = { id: 'granted', consent_status: 'granted' };
const pendingCohort = { id: 'pending', consent_status: 'pending' };
const withdrawnCohort = { id: 'withdrawn', consent_status: 'withdrawn' };

// Roster spanning every deliverability case.
const PEOPLE = {
  'deliverable@x.test': { id: 'ok', cohort_id: 'granted', opted_out: false, cohort: grantedCohort },
  'optedout@x.test': { id: 'oo', cohort_id: 'granted', opted_out: true, cohort: grantedCohort },
  'pending@x.test': { id: 'pd', cohort_id: 'pending', opted_out: false, cohort: pendingCohort },
  'withdrawn@x.test': { id: 'wd', cohort_id: 'withdrawn', opted_out: false, cohort: withdrawnCohort },
};

function makeRepos() {
  const byHash = new Map();
  const cohortsById = new Map();
  for (const [address, p] of Object.entries(PEOPLE)) {
    byHash.set(hashIdentifier(address), p);
    cohortsById.set(p.cohort_id, p.cohort);
  }
  const writes = []; // every repo write, for the data-minimization assertion
  let seq = 0;
  return {
    writes,
    campaigns: { findById: async () => ({ id: 'camp-1', status: 'active' }) },
    participants: { findByIdentifier: async (raw) => byHash.get(hashIdentifier(raw)) },
    cohorts: { findById: async (id) => cohortsById.get(id) },
    interactions: {
      findByCampaignAndParticipant: async () => undefined,
      createForTarget: async (attrs) => {
        writes.push({ method: 'interactions.createForTarget', attrs });
        seq += 1;
        return { id: `int-${seq}`, ...attrs, tracking_token: `token-${seq}` };
      },
    },
  };
}

describe('delivery guardrail — consent gate + data minimization', () => {
  const RECIPIENTS = Object.keys(PEOPLE);

  test('ONLY the deliverable target is emailed; non-consented/opted-out are never sent', async () => {
    const repos = makeRepos();
    const toAddresses = [];
    const mailer = {
      async send(msg) {
        toAddresses.push(msg.to);
        return { messageId: 'm', status: 'accepted' };
      },
    };

    const summary = await sendCampaign({
      campaignId: 'camp-1',
      recipients: RECIPIENTS,
      mailer,
      repos,
      throttleMs: 0,
    });

    // Exactly one send — the granted, opted-in participant.
    expect(toAddresses).toEqual(['deliverable@x.test']);
    expect(summary.sent).toBe(1);
    expect(summary.skipped.not_deliverable).toBe(3);
    // The blocking reasons are named, and none is a false "deliverable".
    expect(summary.ineligible_reasons).toEqual({
      participant_opted_out: 1,
      cohort_consent_not_granted: 2,
    });
  });

  test('an interaction row is created ONLY for the deliverable target', async () => {
    const repos = makeRepos();
    const mailer = { async send() { return { status: 'accepted' }; } };
    await sendCampaign({
      campaignId: 'camp-1',
      recipients: RECIPIENTS,
      mailer,
      repos,
      throttleMs: 0,
    });
    const created = repos.writes.filter((w) => w.method === 'interactions.createForTarget');
    expect(created).toHaveLength(1);
    expect(created[0].attrs).toEqual({ campaign_id: 'camp-1', participant_id: 'ok' });
  });

  test('the raw recipient address is NEVER written to any repository', async () => {
    const repos = makeRepos();
    const mailer = { async send() { return { status: 'accepted' }; } };
    await sendCampaign({
      campaignId: 'camp-1',
      recipients: RECIPIENTS,
      mailer,
      repos,
      throttleMs: 0,
    });
    const serializedWrites = JSON.stringify(repos.writes);
    for (const address of RECIPIENTS) {
      expect(serializedWrites).not.toContain(address);
    }
    // Interaction writes carry routing fields only — no address, no value.
    for (const w of repos.writes) {
      expect(Object.keys(w.attrs).sort()).toEqual(['campaign_id', 'participant_id']);
    }
  });
});
