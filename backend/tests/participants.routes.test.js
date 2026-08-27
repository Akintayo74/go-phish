'use strict';

// Participant management API contract. Repositories are mocked so the routes
// can be tested without a database. Also asserts the data-minimization
// guardrail at the API boundary: the raw identifier a client posts is passed to
// the hashing repository and never echoed back in a response.

jest.mock('../src/repositories', () => ({
  participants: {
    list: jest.fn(),
    query: jest.fn(),
    findById: jest.fn(),
    createFromIdentifier: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    optOut: jest.fn(),
    optIn: jest.fn(),
  },
  cohorts: {
    findById: jest.fn(),
  },
}));

const request = require('supertest');
const { createApp } = require('../src/app');
const { participants, cohorts } = require('../src/repositories');

function app() {
  return createApp({ logger: () => {} });
}

const RAW_IDENTIFIER = 'victim@bank.example';
const HASH = 'a'.repeat(64);
const storedRow = {
  id: 'p1',
  cohort_id: 'c1',
  email_or_phone_hash: HASH,
  role: 'Teller',
  department: 'Retail',
  opted_out: false,
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('POST /api/participants', () => {
  test('creates from a raw identifier, hashes via repo, never echoes it back', async () => {
    cohorts.findById.mockResolvedValue({ id: 'c1' });
    participants.createFromIdentifier.mockResolvedValue(storedRow);

    const res = await request(app())
      .post('/api/participants')
      .send({ identifier: RAW_IDENTIFIER, cohort_id: 'c1', role: 'Teller', department: 'Retail' })
      .expect(201);

    // The raw identifier reached the hashing repository...
    expect(participants.createFromIdentifier).toHaveBeenCalledWith({
      identifier: RAW_IDENTIFIER,
      cohort_id: 'c1',
      role: 'Teller',
      department: 'Retail',
    });

    // ...but never appears anywhere in the response body.
    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toContain(RAW_IDENTIFIER);
    expect(res.body.data).not.toHaveProperty('identifier');
    expect(res.body.data.email_or_phone_hash).toBe(HASH);
  });

  test('rejects a missing identifier with 400', async () => {
    const res = await request(app())
      .post('/api/participants')
      .send({ cohort_id: 'c1' })
      .expect(400);
    expect(res.body).toEqual({ error: 'identifier_required' });
    expect(participants.createFromIdentifier).not.toHaveBeenCalled();
  });

  test('rejects an unknown cohort with 400', async () => {
    cohorts.findById.mockResolvedValue(undefined);
    const res = await request(app())
      .post('/api/participants')
      .send({ identifier: RAW_IDENTIFIER, cohort_id: 'nope' })
      .expect(400);
    expect(res.body).toEqual({ error: 'cohort_not_found' });
    expect(participants.createFromIdentifier).not.toHaveBeenCalled();
  });

  test('maps a duplicate identifier to 409 without leaking it', async () => {
    cohorts.findById.mockResolvedValue({ id: 'c1' });
    participants.createFromIdentifier.mockRejectedValue(
      Object.assign(new Error('dup'), { code: '23505' })
    );
    const res = await request(app())
      .post('/api/participants')
      .send({ identifier: RAW_IDENTIFIER, cohort_id: 'c1' })
      .expect(409);
    expect(res.body).toEqual({ error: 'participant_already_exists' });
    expect(JSON.stringify(res.body)).not.toContain(RAW_IDENTIFIER);
  });
});

describe('opt-out / opt-in flow', () => {
  test('opt-out sets the flag', async () => {
    participants.findById.mockResolvedValue(storedRow);
    participants.optOut.mockResolvedValue({ ...storedRow, opted_out: true });

    const res = await request(app()).post('/api/participants/p1/opt-out').expect(200);

    expect(res.body.data.opted_out).toBe(true);
    expect(participants.optOut).toHaveBeenCalledWith('p1');
  });

  test('opt-in clears the flag', async () => {
    participants.findById.mockResolvedValue({ ...storedRow, opted_out: true });
    participants.optIn.mockResolvedValue({ ...storedRow, opted_out: false });

    const res = await request(app()).post('/api/participants/p1/opt-in').expect(200);

    expect(res.body.data.opted_out).toBe(false);
    expect(participants.optIn).toHaveBeenCalledWith('p1');
  });

  test('opting out an unknown participant is a 404', async () => {
    participants.findById.mockResolvedValue(undefined);
    await request(app()).post('/api/participants/none/opt-out').expect(404);
    expect(participants.optOut).not.toHaveBeenCalled();
  });
});

describe('GET /api/participants', () => {
  test('lists all participants', async () => {
    participants.list.mockResolvedValue([storedRow]);
    const res = await request(app()).get('/api/participants').expect(200);
    expect(res.body).toEqual({ data: [storedRow] });
  });

  test('scopes by cohort_id when provided', async () => {
    const orderBy = jest.fn().mockResolvedValue([storedRow]);
    const where = jest.fn().mockReturnValue({ orderBy });
    participants.query.mockReturnValue({ where });

    const res = await request(app())
      .get('/api/participants')
      .query({ cohort_id: 'c1' })
      .expect(200);

    expect(where).toHaveBeenCalledWith({ cohort_id: 'c1' });
    expect(res.body).toEqual({ data: [storedRow] });
    expect(participants.list).not.toHaveBeenCalled();
  });
});
