'use strict';

// Delivery service contract (Phase 5). Uses injected fake repositories + a fake
// mailer so it runs without a database or network. Covers the happy path,
// campaign-status gating, recipient dedupe, unknown/already-sent skips, and the
// aggregate summary shape. The consent + no-persisted-address guardrails have
// their own named test (tests/delivery.guardrail.test.js).

const { sendCampaign, buildTrackingUrl, buildPixelUrl } = require('../src/services/delivery');
const { hashIdentifier } = require('../src/lib/hash');

// --- Fakes -----------------------------------------------------------------

function fakeMailer() {
  const sent = [];
  return {
    sent,
    async send(msg) {
      sent.push(msg);
      return { messageId: `m-${sent.length}`, status: 'accepted' };
    },
  };
}

// Build a repos double from a campaign + a set of participants keyed by their
// raw address. Each participant entry: { id, cohort_id, opted_out, cohort }.
function makeRepos({ campaign, people }) {
  const byHash = new Map();
  const cohortsById = new Map();
  for (const [address, p] of Object.entries(people)) {
    byHash.set(hashIdentifier(address), p);
    if (p.cohort) cohortsById.set(p.cohort_id, p.cohort);
  }
  const interactionRows = new Map(); // `${campaign}:${participant}` -> row
  let tokenSeq = 0;
  return {
    _interactionRows: interactionRows,
    campaigns: { findById: async (id) => (campaign && campaign.id === id ? campaign : undefined) },
    participants: { findByIdentifier: async (raw) => byHash.get(hashIdentifier(raw)) },
    cohorts: { findById: async (id) => cohortsById.get(id) },
    interactions: {
      findByCampaignAndParticipant: async (c, p) => interactionRows.get(`${c}:${p}`),
      createForTarget: async ({ campaign_id, participant_id }) => {
        tokenSeq += 1;
        const row = {
          id: `int-${tokenSeq}`,
          campaign_id,
          participant_id,
          tracking_token: `token-${tokenSeq}`,
        };
        interactionRows.set(`${campaign_id}:${participant_id}`, row);
        return row;
      },
    },
  };
}

const grantedCohort = { id: 'c1', consent_status: 'granted' };
const ACTIVE = { id: 'camp-1', status: 'active' };

const baseOpts = { throttleMs: 0 };

describe('sendCampaign — gating', () => {
  test('404 when the campaign does not exist', async () => {
    const repos = makeRepos({ campaign: null, people: {} });
    await expect(
      sendCampaign({ campaignId: 'nope', recipients: ['a@x.test'], repos, ...baseOpts })
    ).rejects.toMatchObject({ status: 404 });
  });

  test('409 when the campaign is not active', async () => {
    const repos = makeRepos({ campaign: { id: 'camp-1', status: 'draft' }, people: {} });
    await expect(
      sendCampaign({ campaignId: 'camp-1', recipients: ['a@x.test'], repos, ...baseOpts })
    ).rejects.toMatchObject({ status: 409, publicMessage: 'cannot_send_from_draft' });
  });

  test('400 when recipients is missing or empty', async () => {
    const repos = makeRepos({ campaign: ACTIVE, people: {} });
    await expect(
      sendCampaign({ campaignId: 'camp-1', recipients: [], repos, ...baseOpts })
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe('sendCampaign — happy path', () => {
  test('mints a token, emails a deliverable target with the tracked link', async () => {
    const repos = makeRepos({
      campaign: ACTIVE,
      people: { 'alice@x.test': { id: 'p1', cohort_id: 'c1', opted_out: false, cohort: grantedCohort } },
    });
    const mailer = fakeMailer();

    const summary = await sendCampaign({
      campaignId: 'camp-1',
      recipients: ['alice@x.test'],
      mailer,
      repos,
      ...baseOpts,
    });

    expect(summary.sent).toBe(1);
    expect(summary.total).toBe(1);
    expect(mailer.sent).toHaveLength(1);
    const msg = mailer.sent[0];
    expect(msg.to).toBe('alice@x.test');
    expect(msg.html).toContain(buildTrackingUrl('token-1'));
    expect(msg.html).toContain(buildPixelUrl('token-1'));
  });

  test('dedupes repeated addresses (case/space-insensitive)', async () => {
    const repos = makeRepos({
      campaign: ACTIVE,
      people: { 'alice@x.test': { id: 'p1', cohort_id: 'c1', opted_out: false, cohort: grantedCohort } },
    });
    const mailer = fakeMailer();
    const summary = await sendCampaign({
      campaignId: 'camp-1',
      recipients: ['alice@x.test', 'ALICE@x.test', '  alice@x.test '],
      mailer,
      repos,
      ...baseOpts,
    });
    expect(summary.total).toBe(1);
    expect(summary.sent).toBe(1);
    expect(mailer.sent).toHaveLength(1);
  });
});

describe('sendCampaign — skips', () => {
  test('counts an unknown recipient (no matching participant)', async () => {
    const repos = makeRepos({ campaign: ACTIVE, people: {} });
    const mailer = fakeMailer();
    const summary = await sendCampaign({
      campaignId: 'camp-1',
      recipients: ['ghost@x.test'],
      mailer,
      repos,
      ...baseOpts,
    });
    expect(summary.skipped.unknown).toBe(1);
    expect(summary.sent).toBe(0);
    expect(mailer.sent).toHaveLength(0);
  });

  test('skips a target that already has an interaction (unless resend)', async () => {
    const repos = makeRepos({
      campaign: ACTIVE,
      people: { 'alice@x.test': { id: 'p1', cohort_id: 'c1', opted_out: false, cohort: grantedCohort } },
    });
    // Pre-seed an interaction for (camp-1, p1).
    repos._interactionRows.set('camp-1:p1', { id: 'int-0', tracking_token: 'existing' });
    const mailer = fakeMailer();

    const first = await sendCampaign({
      campaignId: 'camp-1',
      recipients: ['alice@x.test'],
      mailer,
      repos,
      ...baseOpts,
    });
    expect(first.skipped.already_sent).toBe(1);
    expect(mailer.sent).toHaveLength(0);

    // resend reuses the existing token and does send.
    const second = await sendCampaign({
      campaignId: 'camp-1',
      recipients: ['alice@x.test'],
      resend: true,
      mailer,
      repos,
      ...baseOpts,
    });
    expect(second.sent).toBe(1);
    expect(mailer.sent[0].html).toContain(buildTrackingUrl('existing'));
  });

  test('records a failed send without aborting the batch', async () => {
    const repos = makeRepos({
      campaign: ACTIVE,
      people: {
        'a@x.test': { id: 'p1', cohort_id: 'c1', opted_out: false, cohort: grantedCohort },
        'b@x.test': { id: 'p2', cohort_id: 'c1', opted_out: false, cohort: grantedCohort },
      },
    });
    let n = 0;
    const mailer = {
      sent: [],
      async send(msg) {
        n += 1;
        if (n === 1) throw new Error('provider boom');
        this.sent.push(msg);
        return { messageId: 'm', status: 'accepted' };
      },
    };
    const summary = await sendCampaign({
      campaignId: 'camp-1',
      recipients: ['a@x.test', 'b@x.test'],
      mailer,
      repos,
      ...baseOpts,
    });
    expect(summary.failed).toBe(1);
    expect(summary.sent).toBe(1);
  });
});
