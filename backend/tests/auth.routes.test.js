'use strict';

// Admin authentication API contract (Phase 3). The adminUsers repository is
// mocked so login can be tested without a database. Password verification runs
// for real against a hash we generate here.

jest.mock('../src/repositories', () => ({
  adminUsers: {
    findByEmail: jest.fn(),
    // Mirror the real projection: strip the hash so it can never be serialized.
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
const { hashPassword } = require('../src/lib/password');
const jwt = require('../src/lib/jwt');

function app() {
  return createApp({ logger: () => {} });
}

const PASSWORD = 'a-very-good-password';
const USER = {
  id: 'admin-1',
  name: 'Ada',
  email: 'admin@example.test',
  role: 'program_admin',
  password_hash: hashPassword(PASSWORD),
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('POST /api/auth/login', () => {
  test('returns a token and public admin on valid credentials', async () => {
    adminUsers.findByEmail.mockResolvedValue(USER);

    const res = await request(app())
      .post('/api/auth/login')
      .send({ email: 'admin@example.test', password: PASSWORD })
      .expect(200);

    expect(typeof res.body.token).toBe('string');
    const payload = jwt.verify(res.body.token);
    expect(payload.sub).toBe('admin-1');
    expect(payload.role).toBe('program_admin');

    // The response never leaks the password or its hash.
    expect(res.body.admin).not.toHaveProperty('password_hash');
    expect(JSON.stringify(res.body)).not.toContain(PASSWORD);
    expect(JSON.stringify(res.body)).not.toContain(USER.password_hash);
  });

  test('rejects a wrong password with an opaque 401', async () => {
    adminUsers.findByEmail.mockResolvedValue(USER);
    const res = await request(app())
      .post('/api/auth/login')
      .send({ email: 'admin@example.test', password: 'wrong' })
      .expect(401);
    expect(res.body).toEqual({ error: 'invalid_credentials' });
  });

  test('does not enumerate users: unknown email returns the same 401', async () => {
    adminUsers.findByEmail.mockResolvedValue(undefined);
    const res = await request(app())
      .post('/api/auth/login')
      .send({ email: 'nobody@example.test', password: PASSWORD })
      .expect(401);
    expect(res.body).toEqual({ error: 'invalid_credentials' });
  });

  test('requires email and password', async () => {
    const res = await request(app()).post('/api/auth/login').send({}).expect(400);
    expect(res.body).toEqual({ error: 'email_and_password_required' });
    expect(adminUsers.findByEmail).not.toHaveBeenCalled();
  });
});

describe('GET /api/auth/me', () => {
  test('returns the operator from a valid token', async () => {
    const token = jwt.sign({ sub: 'admin-1', email: 'admin@example.test', role: 'program_admin', name: 'Ada' });
    const res = await request(app())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.admin).toEqual({
      id: 'admin-1',
      email: 'admin@example.test',
      role: 'program_admin',
      name: 'Ada',
    });
  });

  test('rejects a missing token', async () => {
    const res = await request(app()).get('/api/auth/me').expect(401);
    expect(res.body).toEqual({ error: 'missing_token' });
  });

  test('rejects an invalid token', async () => {
    const res = await request(app())
      .get('/api/auth/me')
      .set('Authorization', 'Bearer garbage.token.here')
      .expect(401);
    expect(res.body).toEqual({ error: 'invalid_token' });
  });
});
