'use strict';

// Cohort management API contract. Repositories are mocked so the routes can be
// tested without a database.

jest.mock('../src/repositories', () => ({
  cohorts: {
    list: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    grantConsent: jest.fn(),
    withdrawConsent: jest.fn(),
  },
  participants: {},
}));

const request = require('supertest');
const { createApp } = require('../src/app');
const { cohorts } = require('../src/repositories');
const { authHeader } = require('./helpers/auth');

function app() {
  return createApp({ logger: () => {} });
}

// These routes are behind admin auth (Phase 3); send a valid token by default.
const H = () => authHeader();

beforeEach(() => {
  jest.clearAllMocks();
});

describe('auth', () => {
  test('rejects an unauthenticated request', async () => {
    await request(app()).get('/api/cohorts').expect(401);
    expect(cohorts.list).not.toHaveBeenCalled();
  });
});

describe('POST /api/cohorts', () => {
  test('creates a cohort and returns 201', async () => {
    const row = { id: 'c1', name: 'Retail', consent_status: 'pending' };
    cohorts.create.mockResolvedValue(row);

    const res = await request(app())
      .post('/api/cohorts')
      .set(...H())
      .send({ name: 'Retail', description: 'desc' })
      .expect(201);

    expect(res.body).toEqual({ data: row });
    expect(cohorts.create).toHaveBeenCalledWith({ name: 'Retail', description: 'desc' });
  });

  test('rejects a missing name with 400', async () => {
    const res = await request(app()).post('/api/cohorts').set(...H()).send({}).expect(400);
    expect(res.body).toEqual({ error: 'name_required' });
    expect(cohorts.create).not.toHaveBeenCalled();
  });

  test('does not allow setting consent_status directly on create', async () => {
    cohorts.create.mockResolvedValue({ id: 'c1' });
    await request(app())
      .post('/api/cohorts')
      .set(...H())
      .send({ name: 'X', consent_status: 'granted' })
      .expect(201);
    expect(cohorts.create).toHaveBeenCalledWith({ name: 'X' });
  });
});

describe('GET /api/cohorts', () => {
  test('lists cohorts', async () => {
    cohorts.list.mockResolvedValue([{ id: 'c1' }, { id: 'c2' }]);
    const res = await request(app()).get('/api/cohorts').set(...H()).expect(200);
    expect(res.body).toEqual({ data: [{ id: 'c1' }, { id: 'c2' }] });
  });
});

describe('GET /api/cohorts/:id', () => {
  test('returns 404 for an unknown cohort', async () => {
    cohorts.findById.mockResolvedValue(undefined);
    const res = await request(app()).get('/api/cohorts/missing').set(...H()).expect(404);
    expect(res.body).toEqual({ error: 'cohort_not_found' });
  });
});

describe('consent transitions', () => {
  test('grant moves the cohort to granted', async () => {
    cohorts.findById.mockResolvedValue({ id: 'c1', consent_status: 'pending' });
    cohorts.grantConsent.mockResolvedValue({ id: 'c1', consent_status: 'granted' });

    const res = await request(app()).post('/api/cohorts/c1/consent/grant').set(...H()).expect(200);

    expect(res.body.data.consent_status).toBe('granted');
    expect(cohorts.grantConsent).toHaveBeenCalledWith('c1');
  });

  test('withdraw moves the cohort to withdrawn', async () => {
    cohorts.findById.mockResolvedValue({ id: 'c1', consent_status: 'granted' });
    cohorts.withdrawConsent.mockResolvedValue({ id: 'c1', consent_status: 'withdrawn' });

    const res = await request(app()).post('/api/cohorts/c1/consent/withdraw').set(...H()).expect(200);

    expect(res.body.data.consent_status).toBe('withdrawn');
    expect(cohorts.withdrawConsent).toHaveBeenCalledWith('c1');
  });

  test('granting a missing cohort is a 404', async () => {
    cohorts.findById.mockResolvedValue(undefined);
    await request(app()).post('/api/cohorts/none/consent/grant').set(...H()).expect(404);
    expect(cohorts.grantConsent).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/cohorts/:id', () => {
  test('deletes an empty cohort with 204', async () => {
    cohorts.findById.mockResolvedValue({ id: 'c1' });
    cohorts.remove.mockResolvedValue(1);
    await request(app()).delete('/api/cohorts/c1').set(...H()).expect(204);
  });

  test('returns 409 when the cohort still has participants (FK restrict)', async () => {
    cohorts.findById.mockResolvedValue({ id: 'c1' });
    cohorts.remove.mockRejectedValue(Object.assign(new Error('fk'), { code: '23503' }));
    const res = await request(app()).delete('/api/cohorts/c1').set(...H()).expect(409);
    expect(res.body).toEqual({ error: 'cohort_has_participants' });
  });
});
