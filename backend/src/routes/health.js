'use strict';

const express = require('express');
const { checkConnection } = require('../db');

const router = express.Router();

// Liveness + dependency check. Returns 200 when the process is up and the
// database is reachable, 503 when the DB is down. Never leaks connection
// details or credentials.
router.get('/health', async (req, res) => {
  const dbOk = await checkConnection();
  res.status(dbOk ? 200 : 503).json({
    status: dbOk ? 'ok' : 'degraded',
    service: 'cat-sim-backend',
    db: dbOk ? 'up' : 'down',
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;
