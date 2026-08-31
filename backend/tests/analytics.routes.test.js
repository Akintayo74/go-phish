'use strict';

// Analytics API contract (Phase 9). The repositories are mocked so the REAL
// service runs end-to-end through the routes without a database. Covers auth
// gating (both roles may read — analytics is the researcher's job), group_by
// validation, the 404, the CSV/JSON export, and the phase-over-phase compare
// endpoint. Uses the config default suppression threshold (5), so groups here
// carry >= 5 members to be reported.

jest.mock('../src/repositories', () => ({
  campaigns: { findById: jest.fn() },
  analytics: {
    interactionFlagsByCampaign: jest.fn(),
    assignmentStatusByCampaign: jest.fn(),
  },
}));

const request = require('supertest');
const { createApp } = require('../src/app');
const { campaigns, analytics } = require('../src/repositories');
const { authHeader, ROLES } = require('./helpers/auth');

function app() {
  return createApp({ logger: () => {} });
}

const adminHeader = () => authHeader({ role: ROLES.PROGRAM_ADMIN });
const researcherHeader = () => authHeader({ role: ROLES.RESEARCHER });

const CAMPAIGN = { id: 'c1', name: 'Baseline', phase_label: 'Phase I', status: 'active' };

function retailFlags(n = 6) {
  return Array.from({ length: n }, (_, i) => ({
    cohort: 'Retail',
    department: 'Retail Banking',
    opened: true,
    clicked: i % 2 === 0,
    submitted: i % 3 === 0,
  }));
}

beforeEach(() => {
  jest.clearAllMocks();
  campaigns.findById.mockResolvedValue(CAMPAIGN);
  analytics.interactionFlagsByCampaign.mockResolvedValue(retailFlags());
  analytics.assignmentStatusByCampaign.mockResolvedValue([]);
});

describe('auth gating', () => {
  test('rejects an unauthenticated request', async () => {
    await request(app()).get('/api/analytics/campaigns/c1').expect(401);
    expect(analytics.interactionFlagsByCampaign).not.toHaveBeenCalled();
  });

  test('a researcher may read analytics (not Program-Admin-gated)', async () => {
    const res = await request(app())
      .get('/api/analytics/campaigns/c1')
      .set(...researcherHeader())
      .expect(200);
    expect(res.body.data.campaign.id).toBe('c1');
    expect(res.body.data.interactions.groups[0].key).toBe('Retail');
  });
});

describe('GET /api/analytics/campaigns/:id', () => {
  test('defaults to grouping by cohort and returns the aggregate report', async () => {
    const res = await request(app())
      .get('/api/analytics/campaigns/c1')
      .set(...adminHeader())
      .expect(200);
    expect(res.body.data.group_by).toBe('cohort');
    expect(res.body.data.interactions.total_participants).toBe(6);
    // No identifier fields anywhere in the payload.
    expect(JSON.stringify(res.body)).not.toMatch(/participant_id|email_or_phone_hash/);
  });

  test('accepts group_by=department', async () => {
    const res = await request(app())
      .get('/api/analytics/campaigns/c1?group_by=department')
      .set(...adminHeader())
      .expect(200);
    expect(res.body.data.group_by).toBe('department');
  });

  test('rejects an invalid group_by with 400', async () => {
    const res = await request(app())
      .get('/api/analytics/campaigns/c1?group_by=role')
      .set(...adminHeader())
      .expect(400);
    expect(res.body).toEqual({ error: 'invalid_group_by' });
  });

  test('404s an unknown campaign', async () => {
    campaigns.findById.mockResolvedValue(undefined);
    const res = await request(app())
      .get('/api/analytics/campaigns/none')
      .set(...adminHeader())
      .expect(404);
    expect(res.body).toEqual({ error: 'campaign_not_found' });
  });
});

describe('GET /api/analytics/campaigns/:id/export', () => {
  test('returns CSV with a download disposition by default', async () => {
    const res = await request(app())
      .get('/api/analytics/campaigns/c1/export')
      .set(...adminHeader())
      .expect(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.headers['content-disposition']).toMatch(/attachment; filename="campaign-c1-cohort\.csv"/);
    const [header, ...rows] = res.text.split('\n');
    expect(header.split(',')[0]).toBe('group');
    expect(rows[0].startsWith('Retail,')).toBe(true);
  });

  test('returns JSON when asked', async () => {
    const res = await request(app())
      .get('/api/analytics/campaigns/c1/export?format=json')
      .set(...adminHeader())
      .expect(200);
    expect(res.body.data.columns[0]).toBe('group');
    expect(Array.isArray(res.body.data.rows)).toBe(true);
  });

  test('rejects an unknown format', async () => {
    const res = await request(app())
      .get('/api/analytics/campaigns/c1/export?format=xml')
      .set(...adminHeader())
      .expect(400);
    expect(res.body).toEqual({ error: 'invalid_format' });
  });
});

describe('GET /api/analytics/compare', () => {
  test('compares campaigns supplied as a comma-separated list', async () => {
    campaigns.findById.mockImplementation(async (id) => ({
      id,
      name: id,
      phase_label: id,
      status: 'active',
    }));
    analytics.interactionFlagsByCampaign.mockImplementation(async () => retailFlags());

    const res = await request(app())
      .get('/api/analytics/compare?campaign_ids=c1,c2')
      .set(...researcherHeader())
      .expect(200);
    expect(res.body.data.baseline_campaign_id).toBe('c1');
    expect(res.body.data.campaigns.map((c) => c.campaign.id)).toEqual(['c1', 'c2']);
    expect(res.body.data.deltas[0].campaign_id).toBe('c2');
  });

  test('400s when no campaign ids are supplied', async () => {
    const res = await request(app())
      .get('/api/analytics/compare')
      .set(...adminHeader())
      .expect(400);
    expect(res.body).toEqual({ error: 'campaign_ids_required' });
  });
});
