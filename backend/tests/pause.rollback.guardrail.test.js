'use strict';

// ============================================================================
// NAMED GUARDRAIL TEST (Phase 11) — campaign pause / rollback.
// ============================================================================
//
// Pausing a campaign is a real rollback: while a campaign is NOT `active`, its
// tracked links record no new behavioral flags and trigger no new training
// enrollment. What a paused campaign must NEVER break, and this test pins:
//
//   • the participant still reaches the decoy (the /t redirect is unchanged), so
//     token validity never leaks; and
//   • the disclosure page still renders (guardrail #4 — transparency), even
//     though a paused campaign records nothing new.
//
// The test drives the REAL app (routes + middleware + services) over HTTP with
// an in-memory repository layer, so it proves the gate end to end. Do not weaken.

jest.mock('../src/repositories', () => require('./helpers/memoryRepos').create());

const request = require('supertest');
const { createApp } = require('../src/app');
const repos = require('../src/repositories');
const { isCampaignLive } = require('../src/services/campaignState');
const { enrollFromInteraction } = require('../src/services/enrollment');

const store = repos.__store;

function app() {
  return createApp({ logger: () => {} });
}

// Seed one campaign (status configurable) with a consented, opted-in participant
// who has already been "sent" a tracked link (an interaction row exists), plus
// the published training module the enrollment loop assigns.
function seedScenario({ status }) {
  store.reset();
  const cohort = store.seedCohort({ consent_status: 'granted' });
  const campaign = store.seedCampaign({ status, enrollment_trigger: 'clicked' });
  const participant = store.seedParticipant({ identifier: 'target@corp.test', cohort_id: cohort.id });
  const module = store.seedModule({ slug: 'recognizing-phishing', published: true });
  store.seedQuiz({ learning_module_id: module.id });
  return { cohort, campaign, participant, module };
}

async function mintInteraction(campaign, participant) {
  return repos.interactions.createForTarget({
    campaign_id: campaign.id,
    participant_id: participant.id,
  });
}

describe('pause/rollback guardrail — a paused campaign halts recording + enrollment', () => {
  test('PAUSED: clicking still redirects, but records no click and enrolls no one', async () => {
    const { campaign, participant } = seedScenario({ status: 'paused' });
    const interaction = await mintInteraction(campaign, participant);

    const res = await request(app()).get(`/t/${interaction.tracking_token}`).expect(302);
    // Redirect is UNCHANGED — token validity must not leak on pause.
    expect(res.headers.location).toBe(`/sim/${interaction.tracking_token}`);

    // No new behavioral data recorded.
    const after = store.interactions.get(interaction.id);
    expect(after.clicked).toBe(false);
    expect(after.opened).toBe(false);
    // No enrollment created.
    expect([...store.trainingAssignments.values()]).toHaveLength(0);
  });

  test('PAUSED: submitting the decoy still discloses, but records no submit and enrolls no one', async () => {
    const { campaign, participant } = seedScenario({ status: 'paused' });
    const interaction = await mintInteraction(campaign, participant);

    const res = await request(app())
      .post(`/sim/${interaction.tracking_token}`)
      .type('form')
      .send({ username: 'a@b.test', password: 'hunter2' })
      .expect(303);
    expect(res.headers.location).toBe(`/sim/${interaction.tracking_token}/disclosure`);

    const after = store.interactions.get(interaction.id);
    expect(after.submitted).toBe(false);
    expect([...store.trainingAssignments.values()]).toHaveLength(0);
  });

  test('PAUSED: the disclosure page still renders (guardrail #4) but marks nothing', async () => {
    const { campaign, participant } = seedScenario({ status: 'paused' });
    const interaction = await mintInteraction(campaign, participant);

    const res = await request(app())
      .get(`/sim/${interaction.tracking_token}/disclosure`)
      .expect(200);
    expect(res.text.toLowerCase()).toContain('simulation');

    const after = store.interactions.get(interaction.id);
    expect(after.disclosed).toBe(false);
  });

  test('ACTIVE control: clicking DOES record + enroll (proves the gate is what changed)', async () => {
    const { campaign, participant } = seedScenario({ status: 'active' });
    const interaction = await mintInteraction(campaign, participant);

    await request(app()).get(`/t/${interaction.tracking_token}`).expect(302);

    const after = store.interactions.get(interaction.id);
    expect(after.clicked).toBe(true);
    const assignments = [...store.trainingAssignments.values()];
    expect(assignments).toHaveLength(1);
    expect(assignments[0].assigned_reason).toBe('clicked_link');
  });

  test('defense in depth: enrollFromInteraction refuses a paused campaign directly', async () => {
    seedScenario({ status: 'paused' });
    const campaign = [...store.campaigns.values()][0];
    const participant = [...store.participants.values()][0];
    const result = await enrollFromInteraction({
      campaign_id: campaign.id,
      participant_id: participant.id,
      submitted: true,
    });
    expect(result).toEqual({ enrolled: false, reason: 'campaign_not_active' });
  });

  test('isCampaignLive is true only for an active campaign', () => {
    expect(isCampaignLive({ status: 'active' })).toBe(true);
    for (const status of ['draft', 'paused', 'completed', 'archived']) {
      expect(isCampaignLive({ status })).toBe(false);
    }
    expect(isCampaignLive(null)).toBe(false);
    expect(isCampaignLive(undefined)).toBe(false);
    expect(isCampaignLive({})).toBe(false);
  });
});
