'use strict';

// Campaign management API contract (Phase 3). Repositories are mocked so the
// routes are tested without a database. Covers CRUD, the lifecycle state
// machine, that `status` is never settable through create/update, and the
// role gating (researchers are read-only).

jest.mock('../src/repositories', () => ({
  campaigns: {
    list: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    setStatus: jest.fn(),
    clone: jest.fn(),
    lineage: jest.fn(),
  },
}));

const request = require('supertest');
const { createApp } = require('../src/app');
const { campaigns } = require('../src/repositories');
const { authHeader, ROLES } = require('./helpers/auth');

function app() {
  return createApp({ logger: () => {} });
}

const adminHeader = () => authHeader({ role: ROLES.PROGRAM_ADMIN });
const researcherHeader = () => authHeader({ role: ROLES.RESEARCHER });

beforeEach(() => {
  jest.clearAllMocks();
});

describe('auth gating', () => {
  test('rejects an unauthenticated request', async () => {
    await request(app()).get('/api/campaigns').expect(401);
    expect(campaigns.list).not.toHaveBeenCalled();
  });

  test('a researcher may read but not create', async () => {
    campaigns.list.mockResolvedValue([]);
    await request(app()).get('/api/campaigns').set(...researcherHeader()).expect(200);

    const res = await request(app())
      .post('/api/campaigns')
      .set(...researcherHeader())
      .send({ name: 'X' })
      .expect(403);
    expect(res.body).toEqual({ error: 'forbidden' });
    expect(campaigns.create).not.toHaveBeenCalled();
  });
});

describe('POST /api/campaigns', () => {
  test('creates a draft campaign and returns 201', async () => {
    const row = { id: 'k1', name: 'Baseline', status: 'draft' };
    campaigns.create.mockResolvedValue(row);

    const res = await request(app())
      .post('/api/campaigns')
      .set(...adminHeader())
      .send({ name: 'Baseline', description: 'desc', phase_label: 'Phase I' })
      .expect(201);

    expect(res.body).toEqual({ data: row });
    expect(campaigns.create).toHaveBeenCalledWith({
      name: 'Baseline',
      description: 'desc',
      phase_label: 'Phase I',
    });
  });

  test('never accepts a status on create', async () => {
    campaigns.create.mockResolvedValue({ id: 'k1' });
    await request(app())
      .post('/api/campaigns')
      .set(...adminHeader())
      .send({ name: 'X', status: 'active' })
      .expect(201);
    expect(campaigns.create).toHaveBeenCalledWith({ name: 'X' });
  });

  test('rejects a missing name with 400', async () => {
    const res = await request(app())
      .post('/api/campaigns')
      .set(...adminHeader())
      .send({})
      .expect(400);
    expect(res.body).toEqual({ error: 'name_required' });
  });

  test('rejects an invalid enrollment_trigger', async () => {
    const res = await request(app())
      .post('/api/campaigns')
      .set(...adminHeader())
      .send({ name: 'X', enrollment_trigger: 'whenever' })
      .expect(400);
    expect(res.body).toEqual({ error: 'invalid_enrollment_trigger' });
    expect(campaigns.create).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/campaigns/:id', () => {
  test('never accepts a status via update', async () => {
    campaigns.findById.mockResolvedValue({ id: 'k1', status: 'draft' });
    campaigns.update.mockResolvedValue({ id: 'k1', name: 'New' });
    await request(app())
      .patch('/api/campaigns/k1')
      .set(...adminHeader())
      .send({ name: 'New', status: 'active' })
      .expect(200);
    expect(campaigns.update).toHaveBeenCalledWith('k1', { name: 'New' });
  });
});

describe('lifecycle transitions', () => {
  test('activate moves draft -> active', async () => {
    campaigns.findById.mockResolvedValue({ id: 'k1', status: 'draft' });
    campaigns.setStatus.mockResolvedValue({ id: 'k1', status: 'active' });
    const res = await request(app()).post('/api/campaigns/k1/activate').set(...adminHeader()).expect(200);
    expect(res.body.data.status).toBe('active');
    expect(campaigns.setStatus).toHaveBeenCalledWith('k1', 'active');
  });

  test('pause moves active -> paused', async () => {
    campaigns.findById.mockResolvedValue({ id: 'k1', status: 'active' });
    campaigns.setStatus.mockResolvedValue({ id: 'k1', status: 'paused' });
    const res = await request(app()).post('/api/campaigns/k1/pause').set(...adminHeader()).expect(200);
    expect(res.body.data.status).toBe('paused');
  });

  test('rejects an illegal transition with 409', async () => {
    campaigns.findById.mockResolvedValue({ id: 'k1', status: 'archived' });
    const res = await request(app()).post('/api/campaigns/k1/activate').set(...adminHeader()).expect(409);
    expect(res.body).toEqual({ error: 'cannot_active_from_archived' });
    expect(campaigns.setStatus).not.toHaveBeenCalled();
  });

  test('pausing a draft is illegal (409)', async () => {
    campaigns.findById.mockResolvedValue({ id: 'k1', status: 'draft' });
    await request(app()).post('/api/campaigns/k1/pause').set(...adminHeader()).expect(409);
    expect(campaigns.setStatus).not.toHaveBeenCalled();
  });

  test('transition on an unknown campaign is 404', async () => {
    campaigns.findById.mockResolvedValue(undefined);
    await request(app()).post('/api/campaigns/none/activate').set(...adminHeader()).expect(404);
  });
});

describe('POST /api/campaigns/:id/clone (Phase 10 re-test)', () => {
  test('clones a campaign as a new draft phase and returns 201', async () => {
    campaigns.findById.mockResolvedValue({ id: 'k1', name: 'Baseline', status: 'active' });
    const cloned = { id: 'k2', name: 'Baseline — Phase II', status: 'draft', cloned_from_campaign_id: 'k1' };
    campaigns.clone.mockResolvedValue(cloned);

    const res = await request(app())
      .post('/api/campaigns/k1/clone')
      .set(...adminHeader())
      .send({ name: 'Baseline — Phase II', phase_label: 'Phase II' })
      .expect(201);

    expect(res.body).toEqual({ data: cloned });
    expect(campaigns.clone).toHaveBeenCalledWith('k1', {
      name: 'Baseline — Phase II',
      phase_label: 'Phase II',
    });
  });

  test('clones with no overrides (inherits the source definition)', async () => {
    campaigns.findById.mockResolvedValue({ id: 'k1', status: 'completed' });
    campaigns.clone.mockResolvedValue({ id: 'k2', status: 'draft' });
    await request(app()).post('/api/campaigns/k1/clone').set(...adminHeader()).send({}).expect(201);
    expect(campaigns.clone).toHaveBeenCalledWith('k1', {});
  });

  test('never lets the clone override status', async () => {
    campaigns.findById.mockResolvedValue({ id: 'k1', status: 'active' });
    campaigns.clone.mockResolvedValue({ id: 'k2', status: 'draft' });
    await request(app())
      .post('/api/campaigns/k1/clone')
      .set(...adminHeader())
      .send({ name: 'X', status: 'active' })
      .expect(201);
    expect(campaigns.clone).toHaveBeenCalledWith('k1', { name: 'X' });
  });

  test('rejects an empty override name with 400', async () => {
    campaigns.findById.mockResolvedValue({ id: 'k1', status: 'active' });
    const res = await request(app())
      .post('/api/campaigns/k1/clone')
      .set(...adminHeader())
      .send({ name: '   ' })
      .expect(400);
    expect(res.body).toEqual({ error: 'name_required' });
    expect(campaigns.clone).not.toHaveBeenCalled();
  });

  test('rejects an invalid enrollment_trigger with 400', async () => {
    campaigns.findById.mockResolvedValue({ id: 'k1', status: 'active' });
    await request(app())
      .post('/api/campaigns/k1/clone')
      .set(...adminHeader())
      .send({ enrollment_trigger: 'whenever' })
      .expect(400);
    expect(campaigns.clone).not.toHaveBeenCalled();
  });

  test('cloning an unknown campaign is 404', async () => {
    campaigns.findById.mockResolvedValue(undefined);
    await request(app()).post('/api/campaigns/none/clone').set(...adminHeader()).expect(404);
    expect(campaigns.clone).not.toHaveBeenCalled();
  });

  test('a researcher may not clone (403)', async () => {
    const res = await request(app())
      .post('/api/campaigns/k1/clone')
      .set(...researcherHeader())
      .send({ name: 'X' })
      .expect(403);
    expect(res.body).toEqual({ error: 'forbidden' });
    expect(campaigns.clone).not.toHaveBeenCalled();
  });
});

describe('GET /api/campaigns/:id/phases (Phase 10 lineage)', () => {
  test('returns the phase family for a campaign', async () => {
    campaigns.findById.mockResolvedValue({ id: 'k1', status: 'completed' });
    const family = [
      { id: 'k1', phase_label: 'Phase I' },
      { id: 'k2', phase_label: 'Phase II' },
    ];
    campaigns.lineage.mockResolvedValue(family);

    const res = await request(app()).get('/api/campaigns/k1/phases').set(...researcherHeader()).expect(200);
    expect(res.body).toEqual({ data: family });
    expect(campaigns.lineage).toHaveBeenCalledWith('k1');
  });

  test('a researcher may read lineage (read-only endpoint)', async () => {
    campaigns.findById.mockResolvedValue({ id: 'k1' });
    campaigns.lineage.mockResolvedValue([{ id: 'k1' }]);
    await request(app()).get('/api/campaigns/k1/phases').set(...researcherHeader()).expect(200);
  });

  test('lineage of an unknown campaign is 404', async () => {
    campaigns.findById.mockResolvedValue(undefined);
    await request(app()).get('/api/campaigns/none/phases').set(...adminHeader()).expect(404);
    expect(campaigns.lineage).not.toHaveBeenCalled();
  });

  test('rejects an unauthenticated lineage request', async () => {
    await request(app()).get('/api/campaigns/k1/phases').expect(401);
  });
});

describe('DELETE /api/campaigns/:id', () => {
  test('deletes a draft campaign with 204', async () => {
    campaigns.findById.mockResolvedValue({ id: 'k1', status: 'draft' });
    campaigns.remove.mockResolvedValue(1);
    await request(app()).delete('/api/campaigns/k1').set(...adminHeader()).expect(204);
  });

  test('refuses to delete a non-draft campaign (409)', async () => {
    campaigns.findById.mockResolvedValue({ id: 'k1', status: 'active' });
    const res = await request(app()).delete('/api/campaigns/k1').set(...adminHeader()).expect(409);
    expect(res.body).toEqual({ error: 'only_draft_campaigns_deletable' });
    expect(campaigns.remove).not.toHaveBeenCalled();
  });
});
