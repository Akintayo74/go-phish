'use strict';

// ============================================================================
// NAMED GUARDRAIL TEST (Phase 11) — whole-system credential-leak audit.
// ============================================================================
//
// Phases 4/5/8 each pin the "no persisted field values" invariant at their own
// layer. This is the INTEGRATED re-run demanded by Phase 11: it drives the
// entire loop through the REAL app — sending, the tracked link, the decoy form
// carrying credential-shaped values, disclosure, auto-enrollment, and the admin
// notification — while capturing EVERYTHING the system emits, and proves that no
// credential-shaped value and no raw contact address escapes through any sink:
//
//   • request/response logs (the app's structured logger),
//   • console output (stdout/stderr — where a stray trace would land),
//   • every HTTP response body AND headers (including redirect Location), and
//   • the persisted data store (guardrail #1 + #6).
//
// If any layer ever starts echoing, logging, or persisting a submitted value or
// a raw address, this test fails the build. Do not weaken or delete.

jest.mock('../src/repositories', () => require('./helpers/memoryRepos').create());

const request = require('supertest');
const { createApp } = require('../src/app');
const repos = require('../src/repositories');
const { authHeader } = require('./helpers/auth');

const store = repos.__store;

// The credential-shaped values a target would type into the decoy, and the raw
// address the admin supplies transiently for send/notify. NONE may ever surface.
const SECRET_USERNAME = 'victim@bank.example';
const SECRET_PASSWORD = 'Sup3rSecret!Passw0rd';
const RAW_ADDRESS = 'chidi@corp.test';
// The submitted VALUES and the raw address must never appear in ANY sink.
const SECRETS = [SECRET_USERNAME, SECRET_PASSWORD, RAW_ADDRESS];

describe('whole-system credential-leak audit (integrated)', () => {
  test('no submitted value or raw address escapes through any sink across the full loop', async () => {
    store.reset();
    const cohort = store.seedCohort({ consent_status: 'granted' });
    const campaign = store.seedCampaign({ status: 'active', enrollment_trigger: 'clicked' });
    const participant = store.seedParticipant({ identifier: RAW_ADDRESS, cohort_id: cohort.id });
    const module = store.seedModule({ slug: 'recognizing-phishing', published: true });
    store.seedQuiz({ learning_module_id: module.id, pass_threshold: 50 });

    // --- Capture every sink ------------------------------------------------
    const logRecords = [];
    const consoleLines = [];
    const origLog = console.log;
    const origErr = console.error;
    const origWarn = console.warn;
    console.log = (...a) => consoleLines.push(a.join(' '));
    console.error = (...a) => consoleLines.push(a.join(' '));
    console.warn = (...a) => consoleLines.push(a.join(' '));

    const responses = [];
    const capture = (res) => {
      responses.push({ body: res.text, headers: res.headers });
      return res;
    };

    try {
      const server = createApp({ logger: (rec) => logRecords.push(rec) });

      // 1. Admin send (raw address in the body).
      capture(
        await request(server)
          .post(`/api/campaigns/${campaign.id}/send`)
          .set(...authHeader())
          .send({ recipients: [RAW_ADDRESS] })
          .expect(200)
      );

      const interaction = await repos.interactions.findByCampaignAndParticipant(
        campaign.id,
        participant.id
      );
      const token = interaction.tracking_token;

      // 2. Click.
      capture(await request(server).get(`/t/${token}`).expect(302));
      // 3. Render decoy.
      capture(await request(server).get(`/sim/${token}`).expect(200));
      // 4. Submit the decoy carrying credential-shaped values.
      capture(
        await request(server)
          .post(`/sim/${token}`)
          .type('form')
          .send({ username: SECRET_USERNAME, password: SECRET_PASSWORD })
          .expect(303)
      );
      // 5. Disclosure.
      capture(await request(server).get(`/sim/${token}/disclosure`).expect(200));

      // 6. Complete training, then 7. admin notify (raw address again).
      const [assignment] = [...store.trainingAssignments.values()];
      capture(await request(server).get(`/api/enroll/${assignment.completion_token}`).expect(200));
      capture(
        await request(server)
          .post(`/api/enroll/${assignment.completion_token}/quiz/attempt`)
          .send({ answers: [0] })
          .expect(200)
      );
      capture(
        await request(server)
          .post(`/api/campaigns/${campaign.id}/notify-enrollments`)
          .set(...authHeader())
          .send({ recipients: [RAW_ADDRESS] })
          .expect(200)
      );
    } finally {
      console.log = origLog;
      console.error = origErr;
      console.warn = origWarn;
    }

    // --- Assemble every sink into one blob and audit it --------------------
    const persisted = {
      cohorts: [...store.cohorts.values()],
      campaigns: [...store.campaigns.values()],
      participants: [...store.participants.values()],
      interactions: [...store.interactions.values()],
      trainingAssignments: [...store.trainingAssignments.values()],
    };

    const sinks = {
      logs: JSON.stringify(logRecords),
      console: consoleLines.join('\n'),
      responses: JSON.stringify(responses),
      persisted: JSON.stringify(persisted),
    };

    for (const [name, blob] of Object.entries(sinks)) {
      for (const secret of SECRETS) {
        expect(`${name}:${blob}`.includes(secret)).toBe(false);
      }
    }

    // The literal word "password" legitimately appears in the RENDERED decoy
    // form (it asks for a password) — that is the point of the login page, not a
    // leak. But it must never surface in a log line, a console/trace sink, or the
    // persisted store, where its presence would signal a credential got captured.
    for (const blob of [sinks.logs, sinks.console, sinks.persisted]) {
      expect(blob.toLowerCase()).not.toContain('password');
    }

    // Sanity: the loop actually ran (so the assertions above audited real work).
    expect(persisted.interactions).toHaveLength(1);
    expect(persisted.interactions[0].submitted).toBe(true);
    expect(persisted.trainingAssignments).toHaveLength(1);
    expect(persisted.trainingAssignments[0].status).toBe('completed');

    // And the logger DID run for these requests — it simply carried no secret.
    expect(logRecords.length).toBeGreaterThan(0);
  });
});
