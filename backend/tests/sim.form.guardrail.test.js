'use strict';

// ============================================================================
// NAMED GUARDRAIL TEST (Phase 4) — the dummy form NEVER persists, logs, or
// returns a submitted field value. This is the highest-sensitivity invariant in
// the system (guardrail #1: no real credentials, ever). Do not weaken or delete.
// ============================================================================
//
// It exercises the real POST handler with a request carrying credential-shaped
// fields and proves, three ways, that those values go nowhere:
//   1. Persistence: the ONLY interaction write is `markSubmitted(id)` — called
//      with no value argument — and no submitted value reaches any repo method.
//   2. Logging: the request logger's sink never sees the submitted values.
//   3. Response: the redirect response never echoes the submitted values.

jest.mock('../src/repositories', () => ({
  interactions: {
    findByToken: jest.fn(),
    markSubmitted: jest.fn(),
    markDisclosed: jest.fn(),
    // Present so the assertion "no other write received the secret" is real.
    create: jest.fn(),
    update: jest.fn(),
  },
}));

const request = require('supertest');
const { createApp } = require('../src/app');
const { interactions } = require('../src/repositories');

const SECRET_USERNAME = 'victim@bank.example';
const SECRET_PASSWORD = 'SuperSecret!12345';
const TOKEN = 'tok_phase4_guardrail';

let logRecords;
function app() {
  logRecords = [];
  return createApp({ logger: (rec) => logRecords.push(rec) });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('dummy form guardrail — submitted values go nowhere', () => {
  test('records only submitted=true (no value args) and redirects to disclosure', async () => {
    interactions.findByToken.mockResolvedValue({ id: 'int-1', submitted: false });
    interactions.markSubmitted.mockResolvedValue({ id: 'int-1', submitted: true });

    const res = await request(app())
      .post(`/sim/${TOKEN}`)
      .type('form')
      .send({ username: SECRET_USERNAME, password: SECRET_PASSWORD })
      .expect(303);

    // Redirect points at the disclosure page (transparency, guardrail #4).
    expect(res.headers.location).toBe(`/sim/${TOKEN}/disclosure`);

    // The ONE write is markSubmitted, called with just the id — no field values.
    expect(interactions.markSubmitted).toHaveBeenCalledTimes(1);
    expect(interactions.markSubmitted).toHaveBeenCalledWith('int-1');
    expect(interactions.markSubmitted.mock.calls[0]).toEqual(['int-1']);

    // No submitted value reached ANY repository method.
    const allRepoCalls = JSON.stringify([
      interactions.findByToken.mock.calls,
      interactions.markSubmitted.mock.calls,
      interactions.markDisclosed.mock.calls,
      interactions.create.mock.calls,
      interactions.update.mock.calls,
    ]);
    expect(allRepoCalls).not.toContain(SECRET_USERNAME);
    expect(allRepoCalls).not.toContain(SECRET_PASSWORD);

    // The response body/headers never echo the submitted values.
    const serializedResponse = JSON.stringify({ body: res.text, headers: res.headers });
    expect(serializedResponse).not.toContain(SECRET_USERNAME);
    expect(serializedResponse).not.toContain(SECRET_PASSWORD);

    // The logger never saw the submitted values (route-level body exclusion).
    const serializedLogs = JSON.stringify(logRecords);
    expect(serializedLogs).not.toContain(SECRET_USERNAME);
    expect(serializedLogs).not.toContain(SECRET_PASSWORD);
    expect(serializedLogs).not.toContain('password');
  });

  test('still discards values and discloses when the token is unknown', async () => {
    interactions.findByToken.mockResolvedValue(undefined);

    const res = await request(app())
      .post(`/sim/${TOKEN}`)
      .type('form')
      .send({ username: SECRET_USERNAME, password: SECRET_PASSWORD })
      .expect(303);

    expect(res.headers.location).toBe(`/sim/${TOKEN}/disclosure`);
    // Nothing to mark, and nothing persisted anywhere.
    expect(interactions.markSubmitted).not.toHaveBeenCalled();
    expect(interactions.update).not.toHaveBeenCalled();
    expect(interactions.create).not.toHaveBeenCalled();
  });

  test('does not re-mark an interaction already submitted', async () => {
    interactions.findByToken.mockResolvedValue({ id: 'int-1', submitted: true });

    await request(app())
      .post(`/sim/${TOKEN}`)
      .type('form')
      .send({ username: SECRET_USERNAME, password: SECRET_PASSWORD })
      .expect(303);

    expect(interactions.markSubmitted).not.toHaveBeenCalled();
  });
});
