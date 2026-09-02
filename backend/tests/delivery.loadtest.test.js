'use strict';

// ============================================================================
// PHASE 11 — Email-sending load test.
// ============================================================================
//
// The Dev Guide requires the send path to hold up over a large cohort while
// respecting the provider's rate limit. This drives services/delivery.sendCampaign
// over a large roster with an injected mailer and an injected (no-op) sleep, and
// asserts that at scale it:
//
//   • sends to every deliverable target exactly once (and dedupes repeats),
//   • applies the throttle once per processed send (rate limiting is honored),
//   • returns a correct aggregate-only summary (guardrail #5), and
//   • completes well within a time bound (no accidental O(n^2) blowup).
//
// It uses injected repos (no DB) so it runs in CI; the throttle is exercised via
// the injected sleep counter rather than by actually waiting.

const { sendCampaign } = require('../src/services/delivery');
const { hashIdentifier } = require('../src/lib/hash');

const ROSTER_SIZE = 1000;

// A large roster of granted, opted-in participants, addressed by keyed hash.
function makeRepos(size) {
  const grantedCohort = { id: 'coh', consent_status: 'granted' };
  const byHash = new Map();
  const addresses = [];
  for (let i = 0; i < size; i += 1) {
    const address = `user${i}@corp.test`;
    addresses.push(address);
    byHash.set(hashIdentifier(address), {
      id: `p-${i}`,
      cohort_id: 'coh',
      opted_out: false,
    });
  }
  let seq = 0;
  return {
    addresses,
    repos: {
      campaigns: { findById: async () => ({ id: 'camp', status: 'active' }) },
      participants: { findByIdentifier: async (raw) => byHash.get(hashIdentifier(raw)) },
      cohorts: { findById: async () => grantedCohort },
      interactions: {
        findByCampaignAndParticipant: async () => undefined,
        createForTarget: async (attrs) => {
          seq += 1;
          return { id: `int-${seq}`, ...attrs, tracking_token: `tok-${seq}` };
        },
      },
    },
  };
}

describe('delivery load test — large roster, throttled, aggregate-only', () => {
  test(`sends to all ${ROSTER_SIZE} deliverable targets, throttling each, within the time bound`, async () => {
    const { addresses, repos } = makeRepos(ROSTER_SIZE);

    let sends = 0;
    const mailer = {
      async send() {
        sends += 1;
        return { messageId: `m-${sends}`, status: 'accepted' };
      },
    };

    // Injected throttle: count invocations without actually sleeping, so we can
    // assert the rate limiter fired without making the test slow.
    let throttleCalls = 0;
    const sleep = async () => {
      throttleCalls += 1;
    };

    const started = Date.now();
    const summary = await sendCampaign({
      campaignId: 'camp',
      recipients: addresses,
      mailer,
      repos,
      throttleMs: 5, // > 0 so the throttle path is exercised
      sleep,
    });
    const elapsedMs = Date.now() - started;

    expect(summary.total).toBe(ROSTER_SIZE);
    expect(summary.sent).toBe(ROSTER_SIZE);
    expect(summary.failed).toBe(0);
    expect(summary.skipped).toEqual({ unknown: 0, not_deliverable: 0, already_sent: 0 });
    expect(sends).toBe(ROSTER_SIZE);
    // The throttle is applied once per processed send.
    expect(throttleCalls).toBe(ROSTER_SIZE);
    // Aggregate-only: no per-address field in the receipt.
    expect(summary).not.toHaveProperty('recipients');
    // Sanity performance bound — a linear pass over 1k with a no-op sleep is fast.
    expect(elapsedMs).toBeLessThan(4000);
  });

  test('dedupes a roster with heavy repeats — each unique target is sent once', async () => {
    const { addresses, repos } = makeRepos(50);
    // Repeat the whole roster 20× (with case/space noise) → 1000 entries, 50 unique.
    const noisy = [];
    for (let r = 0; r < 20; r += 1) {
      for (const a of addresses) noisy.push(r % 2 === 0 ? `  ${a.toUpperCase()} ` : a);
    }

    let sends = 0;
    const mailer = {
      async send() {
        sends += 1;
        return { status: 'accepted' };
      },
    };

    const summary = await sendCampaign({
      campaignId: 'camp',
      recipients: noisy,
      mailer,
      repos,
      throttleMs: 0,
    });

    expect(noisy).toHaveLength(1000);
    expect(summary.total).toBe(50);
    expect(summary.sent).toBe(50);
    expect(sends).toBe(50);
  });

  test('a subset of failing sends does not abort the batch (aggregate still complete)', async () => {
    const { addresses, repos } = makeRepos(100);
    let n = 0;
    const mailer = {
      async send() {
        n += 1;
        if (n % 10 === 0) throw new Error('provider 429'); // 10% fail
        return { status: 'accepted' };
      },
    };

    const summary = await sendCampaign({
      campaignId: 'camp',
      recipients: addresses,
      mailer,
      repos,
      throttleMs: 0,
    });

    expect(summary.total).toBe(100);
    expect(summary.sent).toBe(90);
    expect(summary.failed).toBe(10);
    // The provider error is never surfaced verbatim (it could echo an address).
    expect(JSON.stringify(summary)).not.toContain('429');
  });
});
