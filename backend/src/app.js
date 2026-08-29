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
