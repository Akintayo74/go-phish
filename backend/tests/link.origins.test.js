'use strict';

// Participant-facing link origins.
//
// CAT-Sim serves participant links from TWO different origins, and picking the
// wrong one produces a link that resolves to a JSON 404 instead of a page —
// silently, since nothing throws and the send still reports success:
//
//   publicBaseUrl -> THIS API serves /t/<token> and /sim/<token>
//   appBaseUrl    -> the React app serves #/enroll/<token> and #/learn
//
// Both mistakes shipped once: the enrollment email's training link was built
// against publicBaseUrl, and SIM_TRAINING_URL shipped in .env.example as an
// unquoted `/#/learn` (dotenv reads the `#` as a comment, yielding "/").
// These tests pin the distinction so neither regresses.

const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

// Reload src/config under a given environment. jest keeps its OWN module
// registry, so deleting require.cache is not enough — isolateModules is.
//
// Every relevant var is set explicitly (an empty string where we want the
// fallback exercised) rather than deleted: config calls dotenv.config(), which
// would otherwise let a developer's local backend/.env leak into the result and
// make this pass in CI but fail on their machine.
function loadConfigWith(env) {
  const saved = {};
  for (const k of Object.keys(env)) {
    saved[k] = process.env[k];
    process.env[k] = env[k];
  }
  let cfg;
  jest.isolateModules(() => {
    cfg = require('../src/config');
  });
  for (const k of Object.keys(saved)) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  return cfg;
}

describe('appBaseUrl vs publicBaseUrl', () => {
  test('appBaseUrl defaults to publicBaseUrl (single-origin deployment)', () => {
    const cfg = loadConfigWith({
      PUBLIC_BASE_URL: 'https://sim.example.test',
      APP_BASE_URL: '',
    });
    expect(cfg.appBaseUrl).toBe('https://sim.example.test');
    expect(cfg.publicBaseUrl).toBe('https://sim.example.test');
  });

  test('APP_BASE_URL overrides it (frontend on a separate origin)', () => {
    const cfg = loadConfigWith({
      PUBLIC_BASE_URL: 'https://api.example.test',
      APP_BASE_URL: 'https://app.example.test',
    });
    expect(cfg.appBaseUrl).toBe('https://app.example.test');
    expect(cfg.publicBaseUrl).toBe('https://api.example.test');
  });

  test('both strip trailing slashes so links never double up', () => {
    const cfg = loadConfigWith({
      PUBLIC_BASE_URL: 'https://api.example.test///',
      APP_BASE_URL: 'https://app.example.test//',
    });
    expect(cfg.publicBaseUrl).toBe('https://api.example.test');
    expect(cfg.appBaseUrl).toBe('https://app.example.test');
  });
});

describe('the enrollment training link points at the app, not the API', () => {
  test('uses appBaseUrl when the frontend is on a separate origin', () => {
    const saved = [process.env.PUBLIC_BASE_URL, process.env.APP_BASE_URL];
    process.env.PUBLIC_BASE_URL = 'https://api.example.test';
    process.env.APP_BASE_URL = 'https://app.example.test';
    try {
      let url;
      jest.isolateModules(() => {
        const { defaultTrainingUrl } = require('../src/services/enrollment');
        url = defaultTrainingUrl('tok123');
      });
      expect(url).toBe('https://app.example.test/#/enroll/tok123');
      // The specific regression: it must NOT be built against the API origin,
      // which has no such route and would answer {"error":"not_found"}.
      expect(url.startsWith('https://api.example.test')).toBe(false);
    } finally {
      [process.env.PUBLIC_BASE_URL, process.env.APP_BASE_URL] = saved;
    }
  });
});

describe('.env.example ships a usable SIM_TRAINING_URL', () => {
  // Regression: an unquoted '#' opens an inline comment in a .env file, so
  // `SIM_TRAINING_URL=/#/learn` parses as "/" and the disclosure page's
  // training button lands on the API root.
  const files = [
    path.resolve(__dirname, '../.env.example'),
    path.resolve(__dirname, '../../.env.example'),
  ];

  test.each(files)('%s parses to a non-trivial training URL', (file) => {
    const parsed = dotenv.parse(fs.readFileSync(file, 'utf8'));
    const value = parsed.SIM_TRAINING_URL;
    expect(value).toBeDefined();
    expect(value).not.toBe('/');
    expect(value).toContain('/learn');
  });
});
