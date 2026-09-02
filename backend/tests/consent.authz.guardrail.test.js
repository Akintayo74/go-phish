'use strict';

// GUARDRAIL: consent and roster writes are Program Admin only.
//
// Guardrail #3 makes cohort consent the single gate on delivery. That gate is
// only worth anything if the transition into `granted` is itself protected:
// consent is what turns a group of real people into legitimate targets, and
// an individual opt-out is what a person is entitled to have honoured.
//
// A Researcher is a read-only role (see lib/roles.js). This file pins that a
// Researcher session — a valid, authenticated session, not an anonymous one —
// cannot grant or withdraw consent, cannot enrol or delete a participant,
// and cannot flip an opt-out. It pins the complement too: they CAN still
// read, because reading which cohorts
// are consented is part of interpreting an aggregate report.
//
// This is deliberately a server-side test. The admin console also hides these
// controls from a Researcher, but hiding a button is presentation; this is the
// authorization.

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
}));

const request = require('supertest');
const { createApp } = require('../src/app');
const { cohorts, participants } = require('../src/repositories');
const { authHeader, ROLES } = require('./helpers/auth');

function app() {
  return createApp({ logger: () => {} });
}

// A valid session for each role.
const RESEARCHER = () => authHeader({ role: ROLES.RESEARCHER, email: 'r@example.test' });
const ADMIN = () => authHeader({ role: ROLES.PROGRAM_ADMIN });

// Every mutating route on the two consent-bearing routers, as
// [method, path, body]. If a write is added to either router it belongs here.
const CONSENT_WRITES = [
  ['post', '/api/cohorts', { name: 'Retail' }],
  ['patch', '/api/cohorts/c1', { name: 'Renamed' }],
  ['delete', '/api/cohorts/c1', undefined],
  ['post', '/api/cohorts/c1/consent/grant', undefined],
  ['post', '/api/cohorts/c1/consent/withdraw', undefined],
  ['post', '/api/participants', { identifier: 'a@b.test', cohort_id: 'c1' }],
  ['patch', '/api/participants/p1', { role: 'Teller' }],
  ['delete', '/api/participants/p1', undefined],
  ['post', '/api/participants/p1/opt-out', undefined],
  ['post', '/api/participants/p1/opt-in', undefined],
];

beforeEach(() => {
  jest.clearAllMocks();
  // Make every write *succeed* if it were to run, so a 403 can only come from
  // the role guard and never from a missing row further down.
  cohorts.findById.mockResolvedValue({ id: 'c1', name: 'Retail', consent_status: 'pending' });
  cohorts.create.mockResolvedValue({ id: 'c1' });
  cohorts.update.mockResolvedValue({ id: 'c1' });
  cohorts.remove.mockResolvedValue(1);
  cohorts.grantConsent.mockResolvedValue({ id: 'c1', consent_status: 'granted' });
  cohorts.withdrawConsent.mockResolvedValue({ id: 'c1', consent_status: 'withdrawn' });
  participants.findById.mockResolvedValue({ id: 'p1', cohort_id: 'c1', opted_out: false });
  participants.createFromIdentifier.mockResolvedValue({ id: 'p1' });
  participants.update.mockResolvedValue({ id: 'p1' });
  participants.remove.mockResolvedValue(1);
  participants.optOut.mockResolvedValue({ id: 'p1', opted_out: true });
  participants.optIn.mockResolvedValue({ id: 'p1', opted_out: false });
});

describe('GUARDRAIL: a Researcher cannot move consent or the roster', () => {
  test.each(CONSENT_WRITES)('%s %s is forbidden for a Researcher', async (method, path, body) => {
    const req = request(app())[method](path).set(...RESEARCHER());
    const res = await (body === undefined ? req : req.send(body)).expect(403);
    expect(res.body).toEqual({ error: 'forbidden' });
  });

  test('no repository write ran for any Researcher attempt', async () => {
    for (const [method, path, body] of CONSENT_WRITES) {
      const req = request(app())[method](path).set(...RESEARCHER());
      await (body === undefined ? req : req.send(body));
    }
    // The guard runs before the handler, so nothing beyond it was touched —
    // in particular consent never moved and no opt-out was flipped.
    for (const fn of [
      cohorts.create,
      cohorts.update,
      cohorts.remove,
      cohorts.grantConsent,
      cohorts.withdrawConsent,
      participants.createFromIdentifier,
      participants.update,
      participants.remove,
      participants.optOut,
      participants.optIn,
    ]) {
      expect(fn).not.toHaveBeenCalled();
    }
  });

  test('an unauthenticated caller is rejected before the role guard (401)', async () => {
    for (const [method, path, body] of CONSENT_WRITES) {
      const req = request(app())[method](path);
      await (body === undefined ? req : req.send(body)).expect(401);
    }
  });
});

describe('a Program Admin can move consent and the roster', () => {
  test('grant and withdraw both succeed', async () => {
    await request(app()).post('/api/cohorts/c1/consent/grant').set(...ADMIN()).expect(200);
    expect(cohorts.grantConsent).toHaveBeenCalledWith('c1');

    await request(app()).post('/api/cohorts/c1/consent/withdraw').set(...ADMIN()).expect(200);
    expect(cohorts.withdrawConsent).toHaveBeenCalledWith('c1');
  });

  test('an individual opt-out succeeds', async () => {
    await request(app()).post('/api/participants/p1/opt-out').set(...ADMIN()).expect(200);
    expect(participants.optOut).toHaveBeenCalledWith('p1');
  });
});

describe('reads stay open to any authenticated operator', () => {
  test('a Researcher may still list cohorts and participants', async () => {
    cohorts.list.mockResolvedValue([{ id: 'c1', consent_status: 'granted' }]);
    participants.list.mockResolvedValue([{ id: 'p1' }]);

    await request(app()).get('/api/cohorts').set(...RESEARCHER()).expect(200);
    await request(app()).get('/api/cohorts/c1').set(...RESEARCHER()).expect(200);
    await request(app()).get('/api/participants').set(...RESEARCHER()).expect(200);
    await request(app()).get('/api/participants/p1').set(...RESEARCHER()).expect(200);
  });
});
