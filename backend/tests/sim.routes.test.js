'use strict';

// Phase 4 route contract for the simulated landing + disclosure pages.
// Repositories are mocked so the routes are tested without a database. The
// no-persisted-value invariant has its own named test
// (tests/sim.form.guardrail.test.js); this file covers rendering, that the
// routes are public (no admin auth), and the disclosure/marking behavior.

jest.mock('../src/repositories', () => ({
  interactions: {
    findByToken: jest.fn(),
    markSubmitted: jest.fn(),
    markDisclosed: jest.fn(),
  },
}));

const request = require('supertest');
const { createApp } = require('../src/app');
const { interactions } = require('../src/repositories');

const TOKEN = 'tok_render';
function app() {
  return createApp({ logger: () => {} });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('GET /sim/:token (landing)', () => {
  test('renders a login-style HTML page with a form posting back to itself', async () => {
    const res = await request(app()).get(`/sim/${TOKEN}`).expect(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.text).toContain('<form');
    // Posts to the same token path so the handler can flag this interaction.
    expect(res.text).toContain(`action="/sim/${TOKEN}"`);
    expect(res.text).toContain('name="username"');
    expect(res.text).toContain('name="password"');
    // Public route — reachable without an admin session, no DB write on render.
    expect(interactions.markSubmitted).not.toHaveBeenCalled();
  });

  test('does not reveal whether the token is known (no lookup on render)', async () => {
    await request(app()).get(`/sim/${TOKEN}`).expect(200);
    // Render is stateless; it must not depend on / leak token validity.
    expect(interactions.findByToken).not.toHaveBeenCalled();
  });
});

describe('GET /sim/:token/disclosure', () => {
  test('renders the disclosure and marks disclosed for a known token', async () => {
    interactions.findByToken.mockResolvedValue({ id: 'int-1', disclosed: false });
    interactions.markDisclosed.mockResolvedValue({ id: 'int-1', disclosed: true });

    const res = await request(app()).get(`/sim/${TOKEN}/disclosure`).expect(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.text.toLowerCase()).toContain('simulation');
    expect(res.text.toLowerCase()).toContain('nothing you typed was captured');
    expect(interactions.markDisclosed).toHaveBeenCalledWith('int-1');
  });

  test('still discloses when the token is unknown (transparency)', async () => {
    interactions.findByToken.mockResolvedValue(undefined);
    const res = await request(app()).get(`/sim/${TOKEN}/disclosure`).expect(200);
    expect(res.text.toLowerCase()).toContain('simulation');
    expect(interactions.markDisclosed).not.toHaveBeenCalled();
  });

  test('does not re-mark an already-disclosed interaction', async () => {
    interactions.findByToken.mockResolvedValue({ id: 'int-1', disclosed: true });
    await request(app()).get(`/sim/${TOKEN}/disclosure`).expect(200);
    expect(interactions.markDisclosed).not.toHaveBeenCalled();
  });
});

describe('POST /sim/:token (flow)', () => {
  test('marks submitted and redirects (303) to disclosure', async () => {
    interactions.findByToken.mockResolvedValue({ id: 'int-1', submitted: false });
    interactions.markSubmitted.mockResolvedValue({ id: 'int-1', submitted: true });

    const res = await request(app()).post(`/sim/${TOKEN}`).type('form').send({}).expect(303);
    expect(res.headers.location).toBe(`/sim/${TOKEN}/disclosure`);
    expect(interactions.markSubmitted).toHaveBeenCalledWith('int-1');
  });
});
