'use strict';

// Express app factory. Kept separate from the server entrypoint (index.js)
// so tests can import a fresh app without binding a port.

const express = require('express');
const { createRequestLogger } = require('./middleware/requestLogger');
const healthRoutes = require('./routes/health');
const cohortRoutes = require('./routes/cohorts');
const participantRoutes = require('./routes/participants');

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
  // Phase 2 — consent & participant management.
  app.use('/api/cohorts', cohortRoutes);
  app.use('/api/participants', participantRoutes);

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
