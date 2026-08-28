'use strict';

// Phase 5 tracking-route contract. Repositories are mocked so the routes run
// without a database. Covers: the tracked link flips `clicked` and redirects to
// the Phase 4 decoy page; the pixel flips `opened` and returns a GIF; and that
// an unknown token leaks nothing (still redirects / still returns the pixel).

jest.mock('../src/repositories', () => ({
  interactions: {
    findByToken: jest.fn(),
    markClicked: jest.fn(),
    markOpened: jest.fn(),
  },
}));

const request = require('supertest');
const { createApp } = require('../src/app');
const { interactions } = require('../src/repositories');

const TOKEN = 'tok_track';
function app() {
  return createApp({ logger: () => {} });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('GET /t/:token (tracked link)', () => {
  test('marks clicked and redirects (302) to the Phase 4 landing page', async () => {
    interactions.findByToken.mockResolvedValue({ id: 'int-1', clicked: false });
    interactions.markClicked.mockResolvedValue({ id: 'int-1', clicked: true });

    const res = await request(app()).get(`/t/${TOKEN}`).expect(302);
    expect(res.headers.location).toBe(`/sim/${TOKEN}`);
    expect(interactions.markClicked).toHaveBeenCalledWith('int-1');
  });

  test('does not re-mark an already-clicked interaction', async () => {
    interactions.findByToken.mockResolvedValue({ id: 'int-1', clicked: true });
    await request(app()).get(`/t/${TOKEN}`).expect(302);
    expect(interactions.markClicked).not.toHaveBeenCalled();
  });

  test('still redirects for an unknown token (no validity leak)', async () => {
    interactions.findByToken.mockResolvedValue(undefined);
    const res = await request(app()).get(`/t/${TOKEN}`).expect(302);
    expect(res.headers.location).toBe(`/sim/${TOKEN}`);
    expect(interactions.markClicked).not.toHaveBeenCalled();
  });
});

describe('GET /t/:token/pixel.gif (open pixel)', () => {
  test('marks opened and returns a GIF', async () => {
    interactions.findByToken.mockResolvedValue({ id: 'int-1', opened: false });
    interactions.markOpened.mockResolvedValue({ id: 'int-1', opened: true });

    const res = await request(app()).get(`/t/${TOKEN}/pixel.gif`).expect(200);
    expect(res.headers['content-type']).toMatch(/image\/gif/);
    expect(res.headers['cache-control']).toMatch(/no-store/);
    expect(interactions.markOpened).toHaveBeenCalledWith('int-1');
  });

  test('returns the pixel even for an unknown token (no validity leak)', async () => {
    interactions.findByToken.mockResolvedValue(undefined);
    const res = await request(app()).get(`/t/${TOKEN}/pixel.gif`).expect(200);
    expect(res.headers['content-type']).toMatch(/image\/gif/);
    expect(interactions.markOpened).not.toHaveBeenCalled();
  });

  test('does not re-mark an already-opened interaction', async () => {
    interactions.findByToken.mockResolvedValue({ id: 'int-1', opened: true });
    await request(app()).get(`/t/${TOKEN}/pixel.gif`).expect(200);
    expect(interactions.markOpened).not.toHaveBeenCalled();
  });
});
