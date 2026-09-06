'use strict';

// Single-origin static hosting (deployment). The React client calls this API
// with relative paths and the app registers no CORS middleware, so a deployed
// CAT-Sim serves the built SPA from this same Express process.
//
// The contract that matters is the BOUNDARY: the SPA fallback must hand back
// index.html for app routes while leaving every server-owned prefix — /api,
// /t, /sim, /health — to its real handler, including their 404s. A fallback
// that swallows an unknown /api path returns HTML with a 200, and the admin
// console's `res.json()` then fails on markup instead of surfacing the error.

const fs = require('fs');
const os = require('os');
const path = require('path');
const request = require('supertest');
const { createApp } = require('../src/app');

const INDEX_BODY = '<!doctype html><html><body><div id="root"></div></body></html>';
const ASSET_BODY = 'console.log("bundle");';

let distDir;

beforeAll(() => {
  distDir = fs.mkdtempSync(path.join(os.tmpdir(), 'catsim-dist-'));
  fs.mkdirSync(path.join(distDir, 'assets'));
  fs.writeFileSync(path.join(distDir, 'index.html'), INDEX_BODY);
  fs.writeFileSync(path.join(distDir, 'assets', 'index-abc123.js'), ASSET_BODY);
});

afterAll(() => {
  fs.rmSync(distDir, { recursive: true, force: true });
});

function app() {
  return createApp({ logger: () => {}, frontendDist: distDir });
}

describe('SPA hosting', () => {
  test('serves index.html at the root', async () => {
    const res = await request(app()).get('/').expect(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.text).toContain('id="root"');
  });

  test('serves a built asset', async () => {
    const res = await request(app()).get('/assets/index-abc123.js').expect(200);
    expect(res.text).toBe(ASSET_BODY);
  });

  test('index.html is not cached, fingerprinted assets are cached immutably', async () => {
    // A cached index.html keeps referencing the previous build's asset hashes
    // after a redeploy, which is a blank page for anyone holding the old copy.
    const index = await request(app()).get('/').expect(200);
    expect(index.headers['cache-control']).toMatch(/no-cache/);

    const asset = await request(app()).get('/assets/index-abc123.js').expect(200);
    expect(asset.headers['cache-control']).toMatch(/immutable/);
  });
});

describe('the fallback does not shadow server-owned prefixes', () => {
  // Every one of these must reach its real handler and answer as itself,
  // never as index.html.
  test.each([
    ['/api/learn/modules/definitely-not-a-module'],
    ['/api/nope'],
    ['/api/cohorts'],
  ])('%s 404s (or 401s) as JSON, not as the SPA document', async (routePath) => {
    const res = await request(app()).get(routePath);
    expect(res.status).not.toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.text).not.toContain('id="root"');
  });

  test('/health is still answered by the health route', async () => {
    const res = await request(app()).get('/health');
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body.service).toBe('cat-sim-backend');
  });

  test('an unknown asset-shaped path 404s rather than returning HTML', async () => {
    const res = await request(app()).get('/assets/gone-4041.js').expect(404);
    expect(res.body).toEqual({ error: 'not_found' });
  });

  test('an unknown app path falls back to the SPA', async () => {
    // Client routing is hash-based, so this is mostly a deep-link safety net.
    const res = await request(app()).get('/admin').expect(200);
    expect(res.text).toContain('id="root"');
  });
});

describe('static hosting is optional', () => {
  test('with no build present the API still serves, and / 404s as JSON', async () => {
    const bare = createApp({ logger: () => {}, frontendDist: null });
    const res = await request(bare).get('/').expect(404);
    expect(res.body).toEqual({ error: 'not_found' });
  });
});
