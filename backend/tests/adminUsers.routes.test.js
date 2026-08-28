'use strict';

// Admin-user management API contract (Phase 3). Program-admin-only provisioning
// of operator accounts. Repositories mocked; no DB.

jest.mock('../src/repositories', () => ({
  adminUsers: {
    list: jest.fn(),
    findById: jest.fn(),
    createWithPassword: jest.fn(),
    toPublic: (row) => {
      if (!row) return row;
      // eslint-disable-next-line no-unused-vars
      const { password_hash, ...safe } = row;
      return safe;
    },
  },
}));

const request = require('supertest');
const { createApp } = require('../src/app');
const { adminUsers } = require('../src/repositories');
const { authHeader, ROLES } = require('./helpers/auth');

function app() {
  return createApp({ logger: () => {} });
}

const adminHeader = () => authHeader({ role: ROLES.PROGRAM_ADMIN });
const researcherHeader = () => authHeader({ role: ROLES.RESEARCHER });

beforeEach(() => {
  jest.clearAllMocks();
});

describe('POST /api/admin/users', () => {
  test('a program admin can create an operator; hash is never returned', async () => {
    adminUsers.createWithPassword.mockResolvedValue({
      id: 'a2',
      email: 'new@example.test',
      role: 'researcher',
      name: 'New',
      password_hash: 'scrypt$16384$deadbeef$cafef00d',
    });

    const res = await request(app())
      .post('/api/admin/users')
      .set(...adminHeader())
      .send({ email: 'new@example.test', password: 'longenough1', role: 'researcher', name: 'New' })
      .expect(201);

    expect(res.body.data).not.toHaveProperty('password_hash');
    expect(JSON.stringify(res.body)).not.toContain('longenough1');
    expect(JSON.stringify(res.body)).not.toContain('scrypt$');
    expect(adminUsers.createWithPassword).toHaveBeenCalledWith({
      email: 'new@example.test',
      password: 'longenough1',
      role: 'researcher',
      name: 'New',
    });
  });

  test('a researcher is forbidden (403)', async () => {
    const res = await request(app())
      .post('/api/admin/users')
      .set(...researcherHeader())
      .send({ email: 'x@example.test', password: 'longenough1', role: 'researcher' })
      .expect(403);
    expect(res.body).toEqual({ error: 'forbidden' });
    expect(adminUsers.createWithPassword).not.toHaveBeenCalled();
  });

  test('rejects a short password', async () => {
    const res = await request(app())
      .post('/api/admin/users')
      .set(...adminHeader())
      .send({ email: 'x@example.test', password: 'short', role: 'researcher' })
      .expect(400);
    expect(res.body).toEqual({ error: 'password_min_length_8' });
  });

  test('rejects an invalid role', async () => {
    const res = await request(app())
      .post('/api/admin/users')
      .set(...adminHeader())
      .send({ email: 'x@example.test', password: 'longenough1', role: 'superuser' })
      .expect(400);
    expect(res.body).toEqual({ error: 'invalid_role' });
  });

  test('maps a duplicate email to 409', async () => {
    adminUsers.createWithPassword.mockRejectedValue(
      Object.assign(new Error('dup'), { code: '23505' })
    );
    const res = await request(app())
      .post('/api/admin/users')
      .set(...adminHeader())
      .send({ email: 'dupe@example.test', password: 'longenough1', role: 'researcher' })
      .expect(409);
    expect(res.body).toEqual({ error: 'admin_already_exists' });
  });

  test('requires authentication', async () => {
    await request(app())
      .post('/api/admin/users')
      .send({ email: 'x@example.test', password: 'longenough1', role: 'researcher' })
      .expect(401);
  });
});

describe('GET /api/admin/users', () => {
  test('lists operators without hashes', async () => {
    adminUsers.list.mockResolvedValue([
      { id: 'a1', email: 'a@example.test', role: 'program_admin', password_hash: 'scrypt$x' },
    ]);
    const res = await request(app()).get('/api/admin/users').set(...adminHeader()).expect(200);
    expect(res.body.data[0]).not.toHaveProperty('password_hash');
    expect(JSON.stringify(res.body)).not.toContain('scrypt$');
  });
});
