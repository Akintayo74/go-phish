'use strict';

// ============================================================================
// PHASE 11 — Playwright end-to-end: the full simulation → training loop.
// ============================================================================
//
//   send (admin API)  →  click (browser, tracked link)  →  submit (browser,
//   decoy form)  →  disclosure (browser)  →  auto-enroll  →  training completion
//
// Setup and teardown go through the admin API (stable, fast); the human-critical
// steps — following the tracked link, seeing the decoy, submitting it, and
// landing on the disclosure page — run in a real browser. The opaque tracking and
// completion tokens are read from the shared DB as an out-of-band oracle, because
// the API deliberately never returns them (guardrail #5). See e2e/README.md for
// how to bring up the stack this spec expects.

const { test, expect, request } = require('@playwright/test');
const {
  db,
  trackingTokenFor,
  completionTokenFor,
  interactionFlags,
  correctAnswersFor,
} = require('../helpers/db');

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:4000';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@example.test';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'changeme-dev-password';
const ENROLL_MODULE_SLUG = process.env.ENROLLMENT_MODULE_SLUG || 'recognizing-phishing';

// A unique participant address per run so repeated runs don't collide.
const STAMP = Date.now();
const PARTICIPANT_ADDRESS = `e2e.target.${STAMP}@corp.test`;

let conn;
let api; // authenticated admin API context
let ctx = {}; // ids gathered during setup

test.beforeAll(async () => {
  conn = db();

  // --- Admin login -------------------------------------------------------
  const anon = await request.newContext({ baseURL: BACKEND_URL });
  const login = await anon.post('/api/auth/login', {
    data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  expect(login.ok(), `admin login failed (${login.status()})`).toBeTruthy();
  const jwt = (await login.json()).token; // POST /api/auth/login → { token, admin }
  expect(jwt, 'login returned a bearer token').toBeTruthy();
  await anon.dispose();

  api = await request.newContext({
    baseURL: BACKEND_URL,
    extraHTTPHeaders: { Authorization: `Bearer ${jwt}` },
  });

  // --- Seed a consented cohort + participant + active campaign -----------
  const cohortRes = await api.post('/api/cohorts', { data: { name: `E2E Cohort ${STAMP}` } });
  ctx.cohortId = (await cohortRes.json()).data.id;
  await api.post(`/api/cohorts/${ctx.cohortId}/consent/grant`);

  const partRes = await api.post('/api/participants', {
    data: { identifier: PARTICIPANT_ADDRESS, cohort_id: ctx.cohortId, department: 'Finance', role: 'staff' },
  });
  ctx.participantId = (await partRes.json()).data.id;

  const campRes = await api.post('/api/campaigns', {
    data: { name: `E2E Campaign ${STAMP}`, phase_label: 'Phase I', enrollment_trigger: 'clicked' },
  });
  ctx.campaignId = (await campRes.json()).data.id;
  await api.post(`/api/campaigns/${ctx.campaignId}/activate`);

  // --- Send (admin supplies the raw address transiently) -----------------
  const sendRes = await api.post(`/api/campaigns/${ctx.campaignId}/send`, {
    data: { recipients: [PARTICIPANT_ADDRESS] },
  });
  const sendSummary = (await sendRes.json()).data;
  expect(sendSummary.sent).toBe(1);

  // Oracle: recover the opaque tracking token the send minted.
  ctx.trackingToken = await trackingTokenFor(conn, ctx.campaignId, ctx.participantId);
  expect(ctx.trackingToken, 'tracking token was minted').toBeTruthy();
});

test.afterAll(async () => {
  if (api) await api.dispose();
  if (conn) await conn.destroy();
});

test('participant clicks, submits the decoy, is disclosed, auto-enrolled, and completes training', async ({ page }) => {
  // --- Click the tracked link → redirected to the decoy sign-in page -----
  await page.goto(`/t/${ctx.trackingToken}`);
  await expect(page).toHaveURL(new RegExp(`/sim/${ctx.trackingToken}$`));
  await expect(page.locator('form')).toBeVisible();
  await expect(page.locator('input[name="username"]')).toBeVisible();
  await expect(page.locator('input[name="password"]')).toBeVisible();

  // --- Submit credential-shaped values into the dummy form ---------------
  await page.fill('input[name="username"]', 'victim@bank.example');
  await page.fill('input[name="password"]', 'Sup3rSecret!Passw0rd');
  await Promise.all([page.waitForURL(/\/disclosure$/), page.click('button[type="submit"], input[type="submit"]')]);

  // --- Disclosure page (guardrail #4) ------------------------------------
  await expect(page.locator('body')).toContainText(/simulation/i);
  await expect(page.locator('body')).toContainText(/nothing you typed was captured/i);

  // --- The recorded flags reflect the actions (oracle) -------------------
  const flags = await interactionFlags(conn, ctx.campaignId, ctx.participantId);
  expect(flags.clicked).toBe(true);
  expect(flags.submitted).toBe(true);
  expect(flags.disclosed).toBe(true);

  // --- Auto-enrollment created a training assignment ---------------------
  const completionToken = await completionTokenFor(conn, ctx.campaignId, ctx.participantId);
  expect(completionToken, 'auto-enrollment minted a completion token').toBeTruthy();

  // --- Training completion via the tokened enroll flow -------------------
  // Viewing the assignment starts it (assigned → in_progress).
  const viewRes = await api.get(`/api/enroll/${completionToken}`);
  const view = (await viewRes.json()).data;
  expect(view.module.slug).toBe(ENROLL_MODULE_SLUG);
  expect(view.assignment.status).toBe('in_progress');

  // Pass the knowledge check (correct answers from the DB oracle — the product
  // never exposes the key). A pass marks the assignment completed.
  const answers = await correctAnswersFor(conn, ENROLL_MODULE_SLUG);
  expect(Array.isArray(answers) && answers.length > 0).toBeTruthy();
  const attemptRes = await api.post(`/api/enroll/${completionToken}/quiz/attempt`, {
    data: { answers },
  });
  const attempt = (await attemptRes.json()).data;
  expect(attempt.passed).toBe(true);
  expect(attempt.assignment_status).toBe('completed');
});

test('pause/rollback: a paused campaign records no further interactions', async ({ page }) => {
  // Fresh participant on the same cohort, sent while active, then the campaign is
  // paused BEFORE they click. Their click must still reach the decoy but record
  // nothing (Phase 11 pause/rollback).
  const address = `e2e.paused.${STAMP}@corp.test`;
  const partRes = await api.post('/api/participants', {
    data: { identifier: address, cohort_id: ctx.cohortId, department: 'Finance', role: 'staff' },
  });
  const participantId = (await partRes.json()).data.id;

  await api.post(`/api/campaigns/${ctx.campaignId}/send`, { data: { recipients: [address] } });
  const token = await trackingTokenFor(conn, ctx.campaignId, participantId);
  expect(token).toBeTruthy();

  // Operator pauses the campaign (rollback).
  await api.post(`/api/campaigns/${ctx.campaignId}/pause`);

  // The participant still reaches the decoy (token validity never leaks)…
  await page.goto(`/t/${token}`);
  await expect(page).toHaveURL(new RegExp(`/sim/${token}$`));
  await expect(page.locator('form')).toBeVisible();

  // …but nothing new was recorded for a paused campaign.
  const flags = await interactionFlags(conn, ctx.campaignId, participantId);
  expect(flags.clicked).toBe(false);
  expect(flags.opened).toBe(false);

  // Restore active state so the suite leaves the campaign as it found it.
  await api.post(`/api/campaigns/${ctx.campaignId}/activate`);
});
