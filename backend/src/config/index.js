'use strict';

// Central configuration. Loads .env once, validates, and exposes a frozen
// config object. Every other module reads config from here rather than
// touching process.env directly.

const path = require('path');
const dotenv = require('dotenv');

// Load backend/.env (if present). In test/CI, env vars may be injected
// directly, so a missing file is not an error.
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const NODE_ENV = process.env.NODE_ENV || 'development';

// See `frontendDistPath` below. An explicit FRONTEND_DIST always wins ('' means
// "serve no static files"); otherwise the repo's own build directory is the
// default everywhere except tests.
function resolveFrontendDist() {
  if (process.env.FRONTEND_DIST !== undefined) {
    return process.env.FRONTEND_DIST ? path.resolve(process.env.FRONTEND_DIST) : null;
  }
  if (NODE_ENV === 'test') return null;
  return path.resolve(__dirname, '../../../frontend/dist');
}

// The externally reachable URL of this service, as supplied by the host platform
// when it knows it. PUBLIC_BASE_URL is the most damaging value in this file to
// get wrong — it is the origin a participant's mail client resolves, so a
// deployment that forgets it mails out tracked links pointing at `localhost`
// and the whole simulation is dead on arrival. Reading the platform's own
// variable makes the safe thing the default; an explicit PUBLIC_BASE_URL still
// wins over it.
function platformExternalUrl() {
  return process.env.RENDER_EXTERNAL_URL || null;
}

const config = {
  env: NODE_ENV,
  isProduction: NODE_ENV === 'production',
  isTest: NODE_ENV === 'test',
  port: parseInt(process.env.PORT || '4000', 10),
  databaseUrl:
    process.env.DATABASE_URL ||
    'postgres://catsim:catsim@localhost:5432/catsim_dev',
  // Secret key for HMAC-hashing participant contact identifiers (see
  // src/lib/hash.js). The dev default keeps local/test hashing stable; a real
  // deployment MUST override IDENTITY_HASH_SECRET with a strong random value.
  identityHashSecret:
    process.env.IDENTITY_HASH_SECRET || 'dev-only-insecure-identity-hash-secret',
  // Secret for signing admin-session JWTs (Phase 3, src/lib/jwt.js). The dev
  // default keeps local/test tokens verifiable; a real deployment MUST override
  // JWT_SECRET with a strong random value or admin sessions can be forged.
  jwtSecret: process.env.JWT_SECRET || 'dev-only-insecure-jwt-secret',
  // Admin session lifetime in seconds (default 8h).
  jwtExpiresInSeconds: parseInt(process.env.JWT_EXPIRES_IN_SECONDS || '28800', 10),
  // Phase 4 — simulated landing page. A GENERIC, FICTIONAL brand shown on the
  // dummy login page. It must never impersonate a real organization/brand; the
  // default is an obvious placeholder. Override per deployment if desired.
  simBrandName: process.env.SIM_BRAND_NAME || 'ACME Corp — Staff Portal',
  // Where the disclosure page's "go to training" link points. Phase 6 wires
  // this to the public CAT learning site (the frontend hash route); override
  // per deployment to an absolute URL if the CAT site is served elsewhere.
  simTrainingUrl: process.env.SIM_TRAINING_URL || '/#/learn',

  // Phase 5 — interaction tracking + campaign delivery.
  //
  // Public base URL the tracked links are built against. This is the origin a
  // participant's email client will resolve, so it must be the externally
  // reachable address of this service (not localhost) in a real deployment. The
  // tracked link is `${publicBaseUrl}/t/<token>`.
  publicBaseUrl: (
    process.env.PUBLIC_BASE_URL || platformExternalUrl() || 'http://localhost:4000'
  ).replace(/\/+$/, ''),

  // Origin serving the FRONTEND (admin console + CAT learning site + the
  // participant training view at the #/enroll/<token> hash route). This is a
  // different origin from publicBaseUrl whenever the React app is served
  // separately from this API — the Vite dev server in development, a static
  // host in production. It defaults to publicBaseUrl so a single-origin
  // deployment (frontend served by this Express app) needs no extra config.
  //
  // Participant-facing links must be built against the right one of these two:
  // tracked links (/t, /sim) are served by THIS API -> publicBaseUrl;
  // training links (#/enroll, #/learn) are served by the app -> appBaseUrl.
  //
  // Single-origin deployments leave both unset and inherit the platform's own
  // external URL (see externalUrl above), which is the correct answer for both.
  appBaseUrl: (
    process.env.APP_BASE_URL ||
    process.env.PUBLIC_BASE_URL ||
    platformExternalUrl() ||
    'http://localhost:4000'
  ).replace(/\/+$/, ''),

  // Email provider for simulated sends. 'console' is the default, hermetic
  // transport used for local dev, tests, and CI: it records send metadata only
  // (never the recipient address or body) and dispatches nothing over the
  // network. A real deployment sets a transactional provider (e.g. 'sendgrid')
  // and its credentials; see src/services/mailer.js for the pluggable seam.
  // GUARDRAIL: the test suite is ALWAYS hermetic. NODE_ENV=test forces the
  // console transport no matter what MAIL_PROVIDER says, because a developer or
  // CI box with a real relay in its .env would otherwise dispatch real phishing
  // simulation emails to the suite's fixture addresses on every `npm test`.
  // Fail closed: a test run must never be able to reach the network.
  // (createMailer({ provider: 'smtp', transport }) still works — an explicit
  // provider argument bypasses this default, which is how the smtp tests run.)
  mailProvider: NODE_ENV === 'test' ? 'console' : process.env.MAIL_PROVIDER || 'console',
  // From-address for simulated emails. Generic/fictional — must not impersonate
  // a real organization (guardrail: no real-brand impersonation).
  mailFrom: process.env.MAIL_FROM || 'IT Service Desk <no-reply@catsim.invalid>',
  // Optional API key for a real provider. Never logged.
  mailApiKey: process.env.MAIL_API_KEY || null,

  // SMTP transport settings, used when MAIL_PROVIDER=smtp. Point these at a
  // local catcher (Mailpit on :1025) in dev, or a real relay in production.
  // SMTP_PASS, like mailApiKey, is NEVER logged.
  smtpHost: process.env.SMTP_HOST || null,
  smtpPort: parseInt(process.env.SMTP_PORT || '1025', 10),
  smtpSecure: process.env.SMTP_SECURE === 'true',
  smtpUser: process.env.SMTP_USER || null,
  smtpPass: process.env.SMTP_PASS || null,

  // Outbound send throttle (messages/second) so a large cohort respects the
  // provider's rate limits. 0 disables throttling (used in tests).
  sendRatePerSecond: parseInt(process.env.SEND_RATE_PER_SECOND || '10', 10),

  // Phase 8 — automatic enrollment loop.
  //
  // The learning module a participant is auto-assigned when they meet a
  // campaign's enrollment trigger (click/submit). Defaults to the phishing-
  // recognition module (seeded, published, and carrying a knowledge-check quiz
  // that drives completion). Must be a PUBLISHED module slug or no assignment is
  // created (the loop fails safe rather than assigning invisible content).
  enrollmentModuleSlug: process.env.ENROLLMENT_MODULE_SLUG || 'recognizing-phishing',

  // Recommended interval (days) before re-simulating a participant who has
  // completed their assigned training. This is an advisory hook only — like the
  // Phase 5 send window, nothing is dispatched automatically (the system stores
  // no roster to send to); an admin acts on the recommended date.
  resimulationIntervalDays: parseInt(process.env.RESIMULATION_INTERVAL_DAYS || '90', 10),

  // Phase 9 — analytics dashboard.
  //
  // Small-group suppression threshold (k-anonymity) enforcing guardrail #5
  // (aggregate-only, no per-individual result). Any cohort/department group with
  // FEWER than this many participants is never reported with its own counts — a
  // group of one would otherwise turn an "aggregate" into that person's result.
  // Such groups are collapsed into a single suppressed summary. The whole-campaign
  // total is itself treated as a group: a campaign with fewer than this many
  // targets has all its numbers suppressed. Must be >= 2; defaults to 5.
  analyticsMinGroupSize: Math.max(2, parseInt(process.env.ANALYTICS_MIN_GROUP_SIZE || '5', 10)),

  // Single-origin hosting — absolute path to the built frontend (Vite's
  // `frontend/dist`), or null to disable static hosting entirely.
  //
  // The React client calls this API with RELATIVE paths (`fetch('/api/...')`)
  // and app.js registers no CORS middleware, so the app and the API must share
  // an origin. In a deployment that means THIS process serves the built SPA;
  // in development Vite serves it on :5173 and proxies /api back here, so the
  // directory is simply absent and the static layer never mounts.
  //
  // Set FRONTEND_DIST to relocate the build, or to an empty string to turn
  // static hosting off (e.g. an API-only deployment behind a separate CDN that
  // rewrites /api, /t and /sim to this service).
  //
  // Under NODE_ENV=test the default is OFF, so the suite's assertions about
  // unknown paths do not depend on whether the developer happens to have run a
  // frontend build. The static-layer tests pass `frontendDist` to createApp()
  // explicitly instead.
  frontendDistPath: resolveFrontendDist(),
};

module.exports = Object.freeze(config);
