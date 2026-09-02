'use strict';

// Express app factory. Kept separate from the server entrypoint (index.js)
// so tests can import a fresh app without binding a port.

const express = require('express');
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

function createApp({ logger } = {}) {
  const app = express();

  // Body parsing. NOTE: parsed bodies are used by route handlers only.
  // The request logger (below) never reads req.body — see requestLogger.js.
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));

  // Metadata-only request logging (guardrail: no bodies/query/headers logged).
  app.use(createRequestLogger(logger));

  // Routes
  app.use('/', healthRoutes);

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

  // 404
  app.use((req, res) => {
    res.status(404).json({ error: 'not_found' });
  });

  // Centralized error handler — never echoes the request body back.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    const status = err.status || 500;
    res.status(status).json({ error: err.publicMessage || 'internal_error' });
  });

  return app;
}

module.exports = { createApp };
