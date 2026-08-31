'use strict';

// ============================================================================
// PHASE 11 — Whole-system full-loop integration test (DB-free).
// ============================================================================
//
// The Playwright spec under /e2e drives the same loop through a browser against
// a live stack; this test proves the loop end to end at the HTTP/API level so it
// runs in CI without a Postgres instance or a running frontend. It exercises the
// REAL app — routes, middleware, and the delivery/enrollment/quiz services —
// against the in-memory repository layer, following one participant through:
//
//   send (admin)  →  click (tracked link)  →  submit (decoy form)  →  disclosure
//                 →  auto-enroll  →  view training  →  pass quiz  →  completed
//                 →  notify (admin)
//
// Along the way it asserts the guardrails hold on the integrated system: the
// admin send/notify receipts are aggregate-only (guardrail #5), and no raw
// address is ever persisted (guardrail #6).

jest.mock('../src/repositories', () => require('./helpers/memoryRepos').create());

const request = require('supertest');
const { createApp } = require('../src/app');
const repos = require('../src/repositories');
const { authHeader } = require('./helpers/auth');

const store = repos.__store;
const ADDRESS = 'olu@corp.test';

function app() {
  return createApp({ logger: () => {} });
}

function seed() {
  store.reset();
  const cohort = store.seedCohort({ consent_status: 'granted' });
  const campaign = store.seedCampaign({ status: 'active', enrollment_trigger: 'clicked' });
  const participant = store.seedParticipant({ identifier: ADDRESS, cohort_id: cohort.id });
  const module = store.seedModule({ slug: 'recognizing-phishing', published: true });
  const quiz = store.seedQuiz({
    learning_module_id: module.id,
    pass_threshold: 50,
    questions: [
      { prompt: 'Q1', choices: ['right', 'wrong'], answer_index: 0 },
      { prompt: 'Q2', choices: ['wrong', 'right'], answer_index: 1 },
    ],
  });
  return { cohort, campaign, participant, module, quiz };
}

describe('full simulation → training loop (integrated, DB-free)', () => {
  test('a participant is sent, clicks, submits, is disclosed, auto-enrolled, and completes training', async () => {
    const { campaign, participant, module } = seed();
    const server = app();

    // --- 1. Admin sends the campaign to the raw roster --------------------
    const send = await request(server)
      .post(`/api/campaigns/${campaign.id}/send`)
      .set(...authHeader())
      .send({ recipients: [ADDRESS] })
      .expect(200);

    // Aggregate-only receipt (guardrail #5): counts, no per-address result.
    expect(send.body.data.sent).toBe(1);
    expect(send.body.data).not.toHaveProperty('recipients');
    expect(JSON.stringify(send.body)).not.toContain(ADDRESS);

    // The send minted exactly one interaction row for the deliverable target.
    const interaction = await repos.interactions.findByCampaignAndParticipant(
      campaign.id,
      participant.id
    );
    expect(interaction).toBeTruthy();
    const token = interaction.tracking_token;

    // --- 2. Participant clicks the tracked link --------------------------
    const click = await request(server).get(`/t/${token}`).expect(302);
    expect(click.headers.location).toBe(`/sim/${token}`);
    expect(store.interactions.get(interaction.id).clicked).toBe(true);

    // The click met the campaign's 'clicked' trigger → auto-enrolled.
    const [assignment] = [...store.trainingAssignments.values()];
    expect(assignment).toBeTruthy();
    expect(assignment.assigned_reason).toBe('clicked_link');

    // --- 3. Participant renders the decoy and submits the dummy form ------
    await request(server).get(`/sim/${token}`).expect(200);
    const submit = await request(server)
      .post(`/sim/${token}`)
      .type('form')
      .send({ username: ADDRESS, password: 'nope' })
      .expect(303);
    expect(submit.headers.location).toBe(`/sim/${token}/disclosure`);
    expect(store.interactions.get(interaction.id).submitted).toBe(true);

    // --- 4. Disclosure (guardrail #4) ------------------------------------
    const disclosure = await request(server).get(`/sim/${token}/disclosure`).expect(200);
    expect(disclosure.text.toLowerCase()).toContain('simulation');
    expect(store.interactions.get(interaction.id).disclosed).toBe(true);

    // --- 5. Participant opens their training via the completion token -----
    const enrollToken = assignment.completion_token;
    const view = await request(server).get(`/api/enroll/${enrollToken}`).expect(200);
    expect(view.body.data.module.slug).toBe(module.slug);
    expect(view.body.data.assignment.status).toBe('in_progress');
    // The token/participant id never leak in the projection.
    expect(JSON.stringify(view.body)).not.toContain(enrollToken);
    expect(JSON.stringify(view.body)).not.toContain(participant.id);

    // --- 6. Participant passes the knowledge check → completed -----------
    const attempt = await request(server)
      .post(`/api/enroll/${enrollToken}/quiz/attempt`)
      .send({ answers: [0, 1] })
      .expect(200);
    expect(attempt.body.data.passed).toBe(true);
    expect(attempt.body.data.assignment_status).toBe('completed');
    expect(store.trainingAssignments.get(assignment.id).status).toBe('completed');

    // --- 7. Admin notifies the (now completed) enrollment ----------------
    // The address is used only as the mail `to`; a completed assignment is
    // skipped and nothing raw is persisted.
    const notify = await request(server)
      .post(`/api/campaigns/${campaign.id}/notify-enrollments`)
      .set(...authHeader())
      .send({ recipients: [ADDRESS] })
      .expect(200);
    expect(notify.body.data.skipped.already_notified).toBe(1);
    expect(JSON.stringify(notify.body)).not.toContain(ADDRESS);

    // --- Guardrail #6: no raw address anywhere in the persisted store -----
    const persisted = JSON.stringify({
      interactions: [...store.interactions.values()],
      participants: [...store.participants.values()],
      trainingAssignments: [...store.trainingAssignments.values()],
      campaigns: [...store.campaigns.values()],
    });
    expect(persisted).not.toContain(ADDRESS);
  });

  test('a failing quiz attempt does NOT complete the assignment', async () => {
    const { campaign, participant } = seed();
    const server = app();

    await request(server)
      .post(`/api/campaigns/${campaign.id}/send`)
      .set(...authHeader())
      .send({ recipients: [ADDRESS] })
      .expect(200);
    const interaction = await repos.interactions.findByCampaignAndParticipant(
      campaign.id,
      participant.id
    );
    await request(server).get(`/t/${interaction.tracking_token}`).expect(302);
    const [assignment] = [...store.trainingAssignments.values()];

    const attempt = await request(server)
      .post(`/api/enroll/${assignment.completion_token}/quiz/attempt`)
      .send({ answers: [1, 0] }) // both wrong
      .expect(200);
    expect(attempt.body.data.passed).toBe(false);
    expect(attempt.body.data.assignment_status).not.toBe('completed');
    expect(store.trainingAssignments.get(assignment.id).status).not.toBe('completed');
  });
});
