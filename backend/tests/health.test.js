'use strict';

// Health endpoint contract. The DB layer is mocked so the test does not
// require a running PostgreSQL instance.

jest.mock('../src/db', () => ({
  db: { destroy: jest.fn() },
  checkConnection: jest.fn(),
}));

const request = require('supertest');
const { createApp } = require('../src/app');
const { checkConnection } = require('../src/db');

describe('GET /health', () => {
  test('returns 200 and ok status when the database is reachable', async () => {
    checkConnection.mockResolvedValue(true);
    const app = createApp({ logger: () => {} });

    const res = await request(app).get('/health').expect(200);

    expect(res.body).toMatchObject({
      status: 'ok',
      service: 'cat-sim-backend',
      db: 'up',
    });
    expect(typeof res.body.timestamp).toBe('string');
  });

  test('returns 503 and degraded status when the database is down', async () => {
    checkConnection.mockResolvedValue(false);
    const app = createApp({ logger: () => {} });

    const res = await request(app).get('/health').expect(503);

    expect(res.body).toMatchObject({ status: 'degraded', db: 'down' });
  });
});

describe('unknown routes', () => {
  test('return 404 JSON', async () => {
    checkConnection.mockResolvedValue(true);
    const app = createApp({ logger: () => {} });
    const res = await request(app).get('/does-not-exist').expect(404);
    expect(res.body).toEqual({ error: 'not_found' });
  });
});
