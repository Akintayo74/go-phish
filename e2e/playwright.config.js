'use strict';

// Playwright configuration for the CAT-Sim full-loop E2E (Phase 11).
//
// The E2E runs against a LIVE stack — a running backend (with a migrated
// Postgres) and, for the training-site portion, the built/served frontend.
// Point it at your environment with env vars (see e2e/README.md):
//
//   BACKEND_URL   the backend origin that serves /t, /sim, /api  (default :4000)
//   FRONTEND_URL  the origin serving the React app (#/enroll, #/learn) (default :5173)
//   DATABASE_URL  the same DB the backend uses — the spec reads the minted
//                 tracking/completion tokens from it as an out-of-band oracle,
//                 because the API deliberately never returns them (guardrail #5).

const { defineConfig, devices } = require('@playwright/test');

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:4000';

module.exports = defineConfig({
  testDir: './tests',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: BACKEND_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
