'use strict';

// Analytics API (Phase 9) — aggregate-only (guardrail #5).
//
// Read-only and available to ANY authenticated operator: analytics is the
// Researcher/Evaluator's core job, so — unlike campaign writes — it is NOT
// Program-Admin-gated (both roles may read). Every response is an aggregate over
// a cohort/department group with small-group suppression already applied by the
// service, so no endpoint here can return a per-individual result.
//
// Routes:
//   GET /api/analytics/campaigns/:id[?group_by=cohort|department]
//       → full four-tier breakdown + rates + training completion, grouped.
//   GET /api/analytics/campaigns/:id/export[?group_by=…&format=csv|json]
//       → anonymized tabular export of the four-tier breakdown (CSV by default).
//   GET /api/analytics/compare?campaign_ids=<id>,<id>,…
//       → phase-over-phase side-by-side aggregate metrics + deltas.

const express = require('express');
const { asyncHandler, badRequest } = require('../lib/http');
const { requireAuth } = require('../middleware/auth');
const analytics = require('../services/analytics');

const router = express.Router();

// Every analytics route requires a valid admin session (either role).
router.use(requireAuth);

function parseGroupBy(query) {
  const g = query.group_by || 'cohort';
  if (!analytics.GROUP_BYS.includes(g)) throw badRequest('invalid_group_by');
  return g;
}

router.get(
  '/campaigns/:id',
  asyncHandler(async (req, res) => {
    const groupBy = parseGroupBy(req.query);
    const data = await analytics.campaignAnalytics({ campaignId: req.params.id, groupBy });
    res.json({ data });
  })
);

router.get(
  '/campaigns/:id/export',
  asyncHandler(async (req, res) => {
    const groupBy = parseGroupBy(req.query);
    const format = String(req.query.format || 'csv').toLowerCase();
    const table = await analytics.anonymizedExport({ campaignId: req.params.id, groupBy });

    if (format === 'json') {
      res.json({ data: table });
      return;
    }
    if (format !== 'csv') throw badRequest('invalid_format');

    const csv = analytics.toCsv(table);
    res.type('text/csv');
    res.set(
      'Content-Disposition',
      `attachment; filename="campaign-${encodeURIComponent(req.params.id)}-${groupBy}.csv"`
    );
    res.send(csv);
  })
);

router.get(
  '/compare',
  asyncHandler(async (req, res) => {
    const raw = req.query.campaign_ids || req.query.campaignIds || '';
    const campaignIds = String(raw)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (campaignIds.length === 0) throw badRequest('campaign_ids_required');
    const data = await analytics.comparison({ campaignIds });
    res.json({ data });
  })
);

module.exports = router;
