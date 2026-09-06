'use strict';

// Express app factory. Kept separate from the server entrypoint (index.js)
// so tests can import a fresh app without binding a port.

const fs = require('fs');
const path = require('path');
const express = require('express');
const config = require('./config');
const { createRequestLogger } = require('./middleware/requestLogger');
const { requireAuth } = require('./middleware/auth');
const healthRoutes = require('./routes/health');
const authRoutes = require('./routes/auth');
const adminUserRoutes = require('./routes/adminUsers');
const cohortRoutes = require('./routes/cohorts');
const participantRoutes = require('./routes/participants');
const campaignRoutes = require('./routes/campaigns');
const simRoutes = require('./routes/sim');
const trackRoutes = require('./routes/track');
const learnRoutes = require('./routes/learn');
const enrollRoutes = require('./routes/enroll');
const analyticsRoutes = require('./routes/analytics');

// Path prefixes this API owns. The SPA fallback below must never answer for
// them: an unknown /api route has to 404 as JSON, not come back as index.html
// with a 200 that the client then fails to parse as JSON.
const SERVER_PREFIXES = ['/api', '/t', '/sim', '/health'];

function isServerPath(reqPath) {
  return SERVER_PREFIXES.some(
    (prefix) => reqPath === prefix || reqPath.startsWith(`${prefix}/`)
  );
}

function createApp({ logger, frontendDist = config.frontendDistPath } = {}) {
  const app = express();

  // Body parsing. NOTE: parsed bodies are used by route handlers only.
  // The request logger (below) never reads req.body — see requestLogger.js.
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));

  // Metadata-only request logging (guardrail: no bodies/query/headers logged).
  app.use(createRequestLogger(logger));

  // Routes
  //
  // Health is mounted TWICE, on purpose. `/health` is the platform's check
  // (`render.yaml` healthCheckPath) and must keep that exact path. `/api/health`
  // is what the browser calls: the SPA reaches the API only through `/api`
  // (that is the sole path the Vite dev proxy forwards, and the only prefix the
  // client is built against), so a client-side health check on the bare
  // `/health` would hit the dev server instead of this process. Serving both is
  // one line; the alternative is a second proxy rule plus a build-time origin
  // difference between dev and production.
  app.use('/', healthRoutes);
  app.use('/api', healthRoutes);

  // Phase 3 — admin auth. Login is public; everything else below requires a
  // valid admin session (guardrail: the consent/participant data is sensitive
  // and must not be reachable unauthenticated).
  app.use('/api/auth', authRoutes);
  app.use('/api/admin/users', adminUserRoutes);

  // Phase 2 — consent & participant management. Now behind admin auth.
  app.use('/api/cohorts', requireAuth, cohortRoutes);
  app.use('/api/participants', requireAuth, participantRoutes);

  // Phase 3 — campaign CRUD skeleton (no sending yet; delivery is Phase 5).
  app.use('/api/campaigns', campaignRoutes);

  // Phase 9 — analytics dashboard. Read-only, admin-authenticated (either role —
  // analytics is the Researcher/Evaluator's job). Every response is an AGGREGATE
  // over a cohort/department group with small-group suppression applied by the
  // service (guardrail #5): no per-individual result is reachable here. The
  // router applies requireAuth itself (like campaigns).
  app.use('/api/analytics', analyticsRoutes);

  // Phase 6 — CAT platform content. PUBLIC and UNAUTHENTICATED: the learning
  // site is a resource anyone may read (not gated behind failing a sim). Serves
  // published lesson modules + the resource library; read-only, records nothing
  // about who reads what (see routes/learn.js).
  app.use('/api/learn', learnRoutes);

  // Phase 8 — enrollment / training completion. Participant-facing and
  // UNAUTHENTICATED, reached from the enrollment email by an opaque assignment
  // token: GET returns the assignment + assigned module (marking it in_progress),
  // and the quiz-attempt POST scores server-side and marks completion on a pass.
  // See routes/enroll.js.
  app.use('/api/enroll', enrollRoutes);

  // Phase 5 — interaction tracking. Participant-facing, UNAUTHENTICATED: the
  // tracked link `/t/:token` flips clicked/opened and redirects to the Phase 4
  // decoy page; `/t/:token/pixel.gif` is the optional open-tracking pixel. These
  // record behavioral flags only — no form, no body (see routes/track.js).
  app.use('/t', trackRoutes);

  // Phase 4 — simulated landing page + dummy form + disclosure. Participant-
  // facing and intentionally UNAUTHENTICATED (reached via a tracked link, not
  // the admin console). The POST handler discards all posted values — see
  // routes/sim.js and views/simPages.js (guardrail #1).
  app.use('/sim', simRoutes);

  // Single-origin static hosting. The React client calls this API with RELATIVE
  // paths (`fetch('/api/...')`) and this app registers no CORS middleware, so
  // the app and the API must share an origin — in a deployment, this process
  // serves the built SPA. In development Vite serves it on :5173 and proxies
  // /api back here, so `frontend/dist` is absent and none of this mounts.
  const indexHtml = frontendDist ? path.join(frontendDist, 'index.html') : null;
  if (indexHtml && fs.existsSync(indexHtml)) {
    app.use(
      express.static(frontendDist, {
        // index.html is served by the fallback below, never by the static
        // layer, so exactly one place decides what a document request returns.
        index: false,
        setHeaders(res, filePath) {
          // Vite fingerprints asset filenames, so those are safe to cache
          // immutably. index.html must NOT be, or a redeploy keeps handing out
          // a document that references the previous build's asset hashes.
          res.setHeader(
            'Cache-Control',
            filePath === indexHtml
              ? 'no-cache'
              : 'public, max-age=31536000, immutable'
          );
        },
      })
    );

    // SPA fallback. Client routing is hash-based (`#/admin`, `#/learn`,
    // `#/enroll/<token>`), so the server only ever hands back index.html for a
    // document request outside its own prefixes; the hash never reaches here.
    app.get('*', (req, res, next) => {
      if (isServerPath(req.path)) return next();
      // An asset-shaped request that got past express.static does not exist.
      // Let it fall through to the JSON 404 rather than answering a missing
      // .js/.css/.png with an HTML body and a 200.
      if (path.extname(req.path)) return next();
      // Set explicitly: this path bypasses express.static (and its setHeaders),
      // and sendFile's own default is `public, max-age=0`.
      res.setHeader('Cache-Control', 'no-cache');
      return res.sendFile(indexHtml);
    });
  }

  // 404
  app.use((req, res) => {
    res.status(404).json({ error: 'not_found' });
  });

  // Centralized error handler — never echoes the request body back, and never
  // logs it either (guardrail #2: no body/query/headers ever reach a log sink).
  //
  // A 5xx is a SERVER fault the operator has to be able to see. Without this,
  // an unexpected throw — e.g. a mail provider that cannot be built from its
  // env vars (services/mailer.js fails closed) — surfaced only as an opaque
  // `internal_error` to the client and left NO trace in the logs, so the real
  // cause was invisible. We log request metadata plus the error's own
  // message/stack, which our code controls and keeps free of recipient
  // addresses and secrets (the mailer re-throws status/code only). We do NOT
  // log 4xx (ordinary client validation) to keep the stream readable.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    const status = err.status || 500;
    if (status >= 500) {
      // eslint-disable-next-line no-console
      console.error(
        `[error] method=${req.method} path=${req.path} status=${status} :: ${
          (err && (err.stack || err.message)) || err
        }`
      );
    }
    res.status(status).json({ error: err.publicMessage || 'internal_error' });
  });

  return app;
}

module.exports = { createApp };
