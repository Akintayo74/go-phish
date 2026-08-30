'use strict';

// Phase 8 enrollment-service contract. Uses injected fake repositories + a fake
// mailer so it runs without a database or network. Covers the trigger→assignment
// core (per-campaign strictness + idempotency), the best-effort wrapper, the
// re-simulation hook, and the notification summary/skips. The no-persisted-
// address + aggregate-only guardrails have their own named test
// (tests/enrollment.guardrail.test.js).

const {
  enrollFromInteraction,
  safeEnrollFromInteraction,
  meetsTrigger,
  assignedReasonFor,
  nextResimulationDate,
  notifyEnrollments,
} = require('../src/services/enrollment');
const { hashIdentifier } = require('../src/lib/hash');

const MODULE = { id: 'mod-1', slug: 'recognizing-phishing', title: 'Recognize Phishing' };

// Repos double for the enrollment core.
function makeEnrollRepos({ campaign, module = MODULE, existing } = {}) {
  const created = [];
  return {
    _created: created,
    campaigns: { findById: async (id) => (campaign && campaign.id === id ? campaign : undefined) },
    learningModules: {
      findPublishedBySlug: async (slug) => (module && module.slug === slug ? module : undefined),
    },
    trainingAssignments: {
      findExisting: async () => existing,
      createForEnrollment: async (attrs) => {
        const row = { id: `ta-${created.length + 1}`, ...attrs };
        created.push(row);
        return row;
      },
    },
  };
}

const submittedCampaign = { id: 'camp-1', enrollment_trigger: 'submitted' };
const clickedCampaign = { id: 'camp-2', enrollment_trigger: 'clicked' };

describe('meetsTrigger / assignedReasonFor', () => {
  test('submit always meets the trigger; reason is submitted_form', () => {
    expect(meetsTrigger(submittedCampaign, { submitted: true })).toBe(true);
    expect(meetsTrigger(clickedCampaign, { submitted: true, clicked: true })).toBe(true);
    expect(assignedReasonFor({ submitted: true })).toBe('submitted_form');
  });

  test("a click-only interaction meets only a 'clicked' campaign", () => {
    expect(meetsTrigger(clickedCampaign, { clicked: true })).toBe(true);
    expect(meetsTrigger(submittedCampaign, { clicked: true })).toBe(false);
    expect(assignedReasonFor({ clicked: true })).toBe('clicked_link');
  });

  test('no flags never enrolls', () => {
    expect(meetsTrigger(clickedCampaign, {})).toBe(false);
    expect(meetsTrigger(submittedCampaign, {})).toBe(false);
  });
});

describe('enrollFromInteraction', () => {
  const submittedInteraction = { campaign_id: 'camp-1', participant_id: 'p1', submitted: true };
  const clickedInteraction = { campaign_id: 'camp-2', participant_id: 'p1', clicked: true };

  test('creates a submitted_form assignment when a submit meets the trigger', async () => {
    const repos = makeEnrollRepos({ campaign: submittedCampaign });
    const res = await enrollFromInteraction(submittedInteraction, { repos });
    expect(res).toMatchObject({ enrolled: true, created: true });
    expect(repos._created).toHaveLength(1);
    expect(repos._created[0]).toMatchObject({
      participant_id: 'p1',
      learning_module_id: 'mod-1',
      campaign_id: 'camp-1',
      assigned_reason: 'submitted_form',
    });
  });

  test('creates a clicked_link assignment for a clicked-trigger campaign', async () => {
    const repos = makeEnrollRepos({ campaign: clickedCampaign });
    const res = await enrollFromInteraction(clickedInteraction, { repos });
    expect(res.enrolled).toBe(true);
    expect(repos._created[0].assigned_reason).toBe('clicked_link');
  });

  test('does NOT enroll a click-only interaction on a submit-only campaign', async () => {
    const repos = makeEnrollRepos({ campaign: submittedCampaign });
    const res = await enrollFromInteraction(
      { campaign_id: 'camp-1', participant_id: 'p1', clicked: true },
      { repos }
    );
    expect(res).toEqual({ enrolled: false, reason: 'trigger_not_met' });
    expect(repos._created).toHaveLength(0);
  });

  test('is idempotent — an existing assignment is reused, not recreated', async () => {
    const repos = makeEnrollRepos({
      campaign: submittedCampaign,
      existing: { id: 'ta-existing' },
    });
    const res = await enrollFromInteraction(submittedInteraction, { repos });
    expect(res).toMatchObject({ enrolled: true, created: false });
    expect(res.assignment.id).toBe('ta-existing');
    expect(repos._created).toHaveLength(0);
  });

  test('fails safe when the target module is unavailable/unpublished', async () => {
    const repos = makeEnrollRepos({ campaign: submittedCampaign, module: null });
    const res = await enrollFromInteraction(submittedInteraction, { repos });
    expect(res).toEqual({ enrolled: false, reason: 'module_unavailable' });
  });

  test('returns campaign_not_found when the campaign is missing', async () => {
    const repos = makeEnrollRepos({ campaign: null });
    const res = await enrollFromInteraction(submittedInteraction, { repos });
    expect(res).toEqual({ enrolled: false, reason: 'campaign_not_found' });
  });

  test('no_interaction for a missing/campaign-less interaction', async () => {
    const repos = makeEnrollRepos({ campaign: submittedCampaign });
    expect(await enrollFromInteraction(null, { repos })).toEqual({
      enrolled: false,
      reason: 'no_interaction',
    });
    expect(await enrollFromInteraction({ participant_id: 'p1' }, { repos })).toEqual({
      enrolled: false,
      reason: 'no_interaction',
    });
  });

  test('unique-constraint race backstop returns the winning row', async () => {
    let calls = 0;
    const repos = {
      campaigns: { findById: async () => submittedCampaign },
      learningModules: { findPublishedBySlug: async () => MODULE },
      trainingAssignments: {
        findExisting: async () => {
          calls += 1;
          return calls === 1 ? undefined : { id: 'ta-raced' };
        },
        createForEnrollment: async () => {
          throw Object.assign(new Error('unique_violation'), { code: '23505' });
        },
      },
    };
    const res = await enrollFromInteraction(submittedInteraction, { repos });
    expect(res).toMatchObject({ enrolled: true, created: false });
    expect(res.assignment.id).toBe('ta-raced');
  });
});

describe('safeEnrollFromInteraction', () => {
  test('swallows a thrown error and never rejects', async () => {
    const repos = {
      campaigns: {
        findById: async () => {
          throw new Error('db down');
        },
      },
    };
    const res = await safeEnrollFromInteraction(
      { campaign_id: 'c', participant_id: 'p', submitted: true },
      { repos }
    );
    expect(res).toEqual({ enrolled: false, reason: 'error' });
  });
});

describe('nextResimulationDate (re-simulation hook)', () => {
  test('adds the interval to completed_at', () => {
    const completed = new Date('2026-01-01T00:00:00Z');
    const next = nextResimulationDate({ completed_at: completed }, { intervalDays: 90 });
    expect(next.toISOString()).toBe(new Date('2026-04-01T00:00:00Z').toISOString());
  });

  test('is null until the training is completed', () => {
    expect(nextResimulationDate({ completed_at: null })).toBeNull();
    expect(nextResimulationDate({})).toBeNull();
    expect(nextResimulationDate(null)).toBeNull();
  });
});

// --- notifyEnrollments ------------------------------------------------------

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

const grantedCohort = { id: 'coh-1', consent_status: 'granted' };

function makeNotifyRepos({ people = {}, assignmentsByParticipant = {} } = {}) {
  const byHash = new Map();
  const cohortsById = new Map([[grantedCohort.id, grantedCohort]]);
  for (const [address, p] of Object.entries(people)) {
    byHash.set(hashIdentifier(address), p);
    if (p.cohort) cohortsById.set(p.cohort_id, p.cohort);
  }
  const notified = [];
  return {
    _notified: notified,
    campaigns: { findById: async (id) => ({ id }) },
    participants: { findByIdentifier: async (raw) => byHash.get(hashIdentifier(raw)) },
    cohorts: { findById: async (id) => cohortsById.get(id) },
    learningModules: { findById: async () => MODULE },
    trainingAssignments: {
      listByCampaignAndParticipant: async (_c, pid) => assignmentsByParticipant[pid] || [],
      markNotified: async (id) => {
        notified.push(id);
        return { id, notified_at: new Date() };
      },
    },
  };
}

describe('notifyEnrollments', () => {
  test('emails a deliverable participant with a pending assignment and marks it notified', async () => {
    const repos = makeNotifyRepos({
      people: { 'a@x.test': { id: 'p1', cohort_id: 'coh-1', opted_out: false, cohort: grantedCohort } },
      assignmentsByParticipant: {
        p1: [{ id: 'ta-1', status: 'assigned', notified_at: null, completion_token: 'ctok', learning_module_id: 'mod-1' }],
      },
    });
    const mailer = fakeMailer();
    const summary = await notifyEnrollments({
      campaignId: 'camp-1',
      recipients: ['a@x.test'],
      mailer,
      repos,
    });
    expect(summary.notified).toBe(1);
    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0].to).toBe('a@x.test');
    expect(mailer.sent[0].html).toContain('ctok');
    expect(repos._notified).toEqual(['ta-1']);
  });

  test('skips unknown, non-deliverable, no-assignment, and already-notified targets', async () => {
    const repos = makeNotifyRepos({
      people: {
        'known-no-assign@x.test': { id: 'p2', cohort_id: 'coh-1', opted_out: false, cohort: grantedCohort },
        'opted-out@x.test': { id: 'p3', cohort_id: 'coh-1', opted_out: true, cohort: grantedCohort },
        'done@x.test': { id: 'p4', cohort_id: 'coh-1', opted_out: false, cohort: grantedCohort },
      },
      assignmentsByParticipant: {
        p2: [],
        p4: [{ id: 'ta-4', status: 'assigned', notified_at: new Date(), completion_token: 't', learning_module_id: 'mod-1' }],
      },
    });
    const mailer = fakeMailer();
    const summary = await notifyEnrollments({
      campaignId: 'camp-1',
      recipients: ['ghost@x.test', 'known-no-assign@x.test', 'opted-out@x.test', 'done@x.test'],
      mailer,
      repos,
    });
    expect(summary.notified).toBe(0);
    expect(summary.skipped.unknown).toBe(1);
    expect(summary.skipped.no_assignment).toBe(1);
    expect(summary.skipped.not_deliverable).toBe(1);
    expect(summary.skipped.already_notified).toBe(1);
    expect(mailer.sent).toHaveLength(0);
  });

  test('404 when the campaign does not exist; 400 when recipients missing', async () => {
    const repos = { ...makeNotifyRepos(), campaigns: { findById: async () => undefined } };
    await expect(
      notifyEnrollments({ campaignId: 'nope', recipients: ['a@x.test'], repos })
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      notifyEnrollments({ campaignId: 'camp-1', recipients: [], repos: makeNotifyRepos() })
    ).rejects.toMatchObject({ status: 400 });
  });
});
