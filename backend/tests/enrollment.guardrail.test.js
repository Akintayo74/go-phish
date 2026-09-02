'use strict';

// ============================================================================
// NAMED GUARDRAIL TEST — Phase 8 automatic enrollment loop.
// Do not weaken or delete.
// ============================================================================
//
// The enrollment loop and its notification touch three guardrails; this test
// pins each:
//
//  1. GUARDRAIL #6 (data minimization): the notification supplies raw addresses
//     transiently to match a stored participant, but NO raw address is ever
//     written to any repository — only a `notified_at` timestamp (by id) is
//     persisted. (Same contract as Phase 5 delivery.)
//
//  2. GUARDRAIL #5 (aggregate-only reporting): the notify summary handed back to
//     the operator is counts only — never a per-address / per-individual result.
//
//  3. GUARDRAIL #1 (no credentials, ever): an auto-created assignment records
//     only routing fields + WHY the participant was enrolled — never a submitted
//     value or any credential-shaped field.

const { enrollFromInteraction, notifyEnrollments } = require('../src/services/enrollment');
const { hashIdentifier } = require('../src/lib/hash');

const MODULE = { id: 'mod-1', slug: 'recognizing-phishing', title: 'Recognize Phishing' };
const grantedCohort = { id: 'coh-1', consent_status: 'granted' };

// A raw address that, if it ever leaked into a persisted write, this test finds.
const RAW_ADDRESS = 'victim.address@secret.test';

describe('Phase 8 guardrail — notification never persists a raw address', () => {
  test('the only persisted write is markNotified(id); no repo call carries the raw address', async () => {
    const writes = []; // every argument handed to any trainingAssignments method

    const repos = {
      campaigns: { findById: async (id) => ({ id }) },
      participants: {
        findByIdentifier: async (raw) =>
          hashIdentifier(raw) === hashIdentifier(RAW_ADDRESS)
            ? { id: 'p1', cohort_id: 'coh-1', opted_out: false }
            : undefined,
      },
      cohorts: { findById: async () => grantedCohort },
      learningModules: { findById: async () => MODULE },
      trainingAssignments: {
        listByCampaignAndParticipant: async (...args) => {
          writes.push(['listByCampaignAndParticipant', ...args]);
          return [
            {
              id: 'ta-1',
              status: 'assigned',
              notified_at: null,
              completion_token: 'ctok',
              learning_module_id: 'mod-1',
            },
          ];
        },
        markNotified: async (...args) => {
          writes.push(['markNotified', ...args]);
          return { id: args[0], notified_at: new Date() };
        },
      },
    };

    const mailer = { sent: [], async send(m) { this.sent.push(m); return { status: 'accepted' }; } };

    const summary = await notifyEnrollments({
      campaignId: 'camp-1',
      recipients: [RAW_ADDRESS],
      mailer,
      repos,
    });

    // The address WAS used as the mail recipient (its legitimate, transient use)…
    expect(mailer.sent[0].to).toBe(RAW_ADDRESS);
    expect(summary.notified).toBe(1);

    // …but it never appears in any argument passed to a persistence method, nor
    // does its hash. The only mutating write is markNotified('ta-1').
    const flat = JSON.stringify(writes);
    expect(flat).not.toContain(RAW_ADDRESS);
    expect(flat).not.toContain(hashIdentifier(RAW_ADDRESS));
    const mutations = writes.filter((w) => w[0] === 'markNotified');
    expect(mutations).toEqual([['markNotified', 'ta-1']]);
  });
});

describe('Phase 8 guardrail — notify summary is aggregate-only', () => {
  test('the summary is counts only, with no per-address / per-individual field', async () => {
    const repos = {
      campaigns: { findById: async (id) => ({ id }) },
      participants: {
        findByIdentifier: async (raw) =>
          hashIdentifier(raw) === hashIdentifier(RAW_ADDRESS)
            ? { id: 'p1', cohort_id: 'coh-1', opted_out: false }
            : undefined,
      },
      cohorts: { findById: async () => grantedCohort },
      learningModules: { findById: async () => MODULE },
      trainingAssignments: {
        listByCampaignAndParticipant: async () => [
          { id: 'ta-1', status: 'assigned', notified_at: null, completion_token: 'c', learning_module_id: 'mod-1' },
        ],
        markNotified: async (id) => ({ id }),
      },
    };
    const mailer = { async send() { return { status: 'accepted' }; } };

    const summary = await notifyEnrollments({
      campaignId: 'camp-1',
      recipients: [RAW_ADDRESS, 'ghost@x.test'],
      mailer,
      repos,
    });

    // Only aggregate keys; every leaf is a number (or the reasons count map).
    expect(Object.keys(summary).sort()).toEqual(
      ['campaign_id', 'failed', 'ineligible_reasons', 'notified', 'skipped', 'total'].sort()
    );
    expect(typeof summary.notified).toBe('number');
    expect(typeof summary.total).toBe('number');
    // No participant id or address anywhere in the serialized summary.
    const flat = JSON.stringify(summary);
    expect(flat).not.toContain(RAW_ADDRESS);
    expect(flat).not.toContain('p1');
  });
});

describe('Phase 8 guardrail — an assignment holds no credential-shaped field', () => {
  test('createForEnrollment is called with only routing fields + assigned_reason', async () => {
    let insertedAttrs = null;
    const repos = {
      campaigns: { findById: async () => ({ id: 'camp-1', enrollment_trigger: 'submitted' }) },
      learningModules: { findPublishedBySlug: async () => MODULE },
      trainingAssignments: {
        findExisting: async () => undefined,
        createForEnrollment: async (attrs) => {
          insertedAttrs = attrs;
          return { id: 'ta-1', ...attrs };
        },
      },
    };

    // A submit whose posted values would be a credential in the real world — the
    // interaction row (and therefore the enrollment) carries none of it.
    await enrollFromInteraction(
      { campaign_id: 'camp-1', participant_id: 'p1', submitted: true },
      { repos }
    );

    expect(Object.keys(insertedAttrs).sort()).toEqual(
      ['assigned_reason', 'campaign_id', 'learning_module_id', 'participant_id'].sort()
    );
    const CREDENTIAL_SHAPED = /(password|passwd|pwd|credential|secret|otp|pin|token_value|form_data|username|answer)/i;
    for (const key of Object.keys(insertedAttrs)) {
      expect(key).not.toMatch(CREDENTIAL_SHAPED);
    }
    expect(insertedAttrs.assigned_reason).toBe('submitted_form');
  });
});
