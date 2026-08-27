'use strict';

// GUARDRAIL TEST (named, explicit): the request logger must never emit the
// contents of a request body — even when a POST carries credential-shaped
// fields. This is the Phase 0 enforcement of the PRD/Dev Guide rule that no
// credential data reaches any log sink. Do not weaken or delete this test.

const request = require('supertest');
const express = require('express');
const { createRequestLogger } = require('../src/middleware/requestLogger');

function appWithSink(sink) {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  app.use(createRequestLogger(sink));
  app.post('/sim/login', (req, res) => {
    // A real handler would set submitted=true and discard values; here we
    // just acknowledge so the request completes and the logger fires.
    res.status(200).json({ ok: true });
  });
  return app;
}

describe('request logger', () => {
  const SECRET_USERNAME = 'victim@bank.example';
  const SECRET_PASSWORD = 'SuperSecret!12345';

  test('never logs POST body field values (no credential leakage)', async () => {
    const records = [];
    const app = appWithSink((rec) => records.push(rec));

    await request(app)
      .post('/sim/login')
      .send({ username: SECRET_USERNAME, password: SECRET_PASSWORD })
      .expect(200);

    expect(records).toHaveLength(1);

    // Serialize everything the sink received and assert the secrets are absent.
    const serialized = JSON.stringify(records);
    expect(serialized).not.toContain(SECRET_USERNAME);
    expect(serialized).not.toContain(SECRET_PASSWORD);
    expect(serialized).not.toContain('password');

    // The record must contain only the allow-listed safe fields.
    expect(Object.keys(records[0]).sort()).toEqual(
      ['durationMs', 'method', 'path', 'status'].sort()
    );
    expect(records[0]).toMatchObject({
      method: 'POST',
      path: '/sim/login',
      status: 200,
    });
  });

  test('never logs query-string values', async () => {
    const records = [];
    const app = appWithSink((rec) => records.push(rec));

    await request(app)
      .post('/sim/login?token=secret-token-value&pw=hunter2')
      .send({})
      .expect(200);

    const serialized = JSON.stringify(records);
    expect(serialized).not.toContain('secret-token-value');
    expect(serialized).not.toContain('hunter2');
    // req.path excludes the query string entirely.
    expect(records[0].path).toBe('/sim/login');
  });
});
