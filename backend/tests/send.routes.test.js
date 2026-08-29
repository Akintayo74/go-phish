'use strict';

// Contract for POST /api/campaigns/:id/send (Phase 5). The delivery service is
// mocked so this test covers only the route wiring: role gating, body
// validation, and that it forwards to the service and returns its summary. The
// service's own behavior (consent gate, dedupe, etc.) is covered by
// tests/delivery.service.test.js and tests/delivery.guardrail.test.js.

jest.mock('../src/repositories', () => ({
  campaigns: {
    list: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    setStatus: jest.fn(),
  },
}));

jest.mock('../src/services/delivery', () => ({
  sendCampaign: jest.fn(),
}));

const request = require('supertest');
const { createApp } = require('../src/app');
const { sendCampaign } = require('../src/services/delivery');
const { authHeader, ROLES } = require('./helpers/auth');

function app() {
  return createApp({ logger: () => {} });
}
const adminHeader = () => authHeader({ role: ROLES.PROGRAM_ADMIN });
const researcherHeader = () => authHeader({ role: ROLES.RESEARCHER });

beforeEach(() => {
  jest.clearAllMocks();
});

describe('POST /api/campaigns/:id/send', () => {
  test('rejects an unauthenticated request (401)', async () => {
    await request(app()).post('/api/campaigns/k1/send').send({ recipients: ['a@x.test'] }).expect(401);
    expect(sendCampaign).not.toHaveBeenCalled();
  });

  test('a researcher may not send (403)', async () => {
    const res = await request(app())
      .post('/api/campaigns/k1/send')
      .set(...researcherHeader())
      .send({ recipients: ['a@x.test'] })
      .expect(403);
    expect(res.body).toEqual({ error: 'forbidden' });
    expect(sendCampaign).not.toHaveBeenCalled();
  });

  test('rejects a missing/invalid recipients list (400)', async () => {
    const res = await request(app())
      .post('/api/campaigns/k1/send')
      .set(...adminHeader())
      .send({})
      .expect(400);
    expect(res.body).toEqual({ error: 'recipients_required' });
    expect(sendCampaign).not.toHaveBeenCalled();
  });

  test('forwards to the delivery service and returns its summary', async () => {
    const summary = { campaign_id: 'k1', total: 2, sent: 2, skipped: {}, failed: 0 };
    sendCampaign.mockResolvedValue(summary);

    const res = await request(app())
      .post('/api/campaigns/k1/send')
      .set(...adminHeader())
      .send({ recipients: ['a@x.test', 'b@x.test'], resend: true })
      .expect(200);

    expect(res.body).toEqual({ data: summary });
    expect(sendCampaign).toHaveBeenCalledWith({
      campaignId: 'k1',
      recipients: ['a@x.test', 'b@x.test'],
      resend: true,
    });
  });

  test('surfaces a service 409 (e.g. campaign not active) without sending', async () => {
    const err = new Error('cannot_send_from_draft');
    err.status = 409;
    err.publicMessage = 'cannot_send_from_draft';
    sendCampaign.mockRejectedValue(err);

    const res = await request(app())
      .post('/api/campaigns/k1/send')
      .set(...adminHeader())
      .send({ recipients: ['a@x.test'] })
      .expect(409);
    expect(res.body).toEqual({ error: 'cannot_send_from_draft' });
  });
});
