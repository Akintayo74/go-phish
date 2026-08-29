'use strict';

// ============================================================================
// PHASE 6 — CAT platform: lesson modules + resource library (public API).
// ============================================================================
//
// The Cybersecurity Awareness Training site is PUBLIC and UNAUTHENTICATED — it
// is a learning resource anyone may read, explicitly NOT gated behind failing a
// simulation (IMPLEMENTATION_PLAN Phase 6). It reads content only; it never
// writes, never touches participant/consent data, and never records who read
// what (data minimization, guardrail #6 — reading a lesson is not tracked).
//
//   GET /api/learn/modules            → published module index (metadata only),
//                                        optionally ?category=<slug>
//   GET /api/learn/modules/:slug      → one published module, with its body
//   GET /api/learn/library            → resource library grouped by category
//
// Only `published = true` modules are ever exposed here (see
// repositories/learningModules.js) — a draft module cannot leak to the public.

const express = require('express');
const { learningModules } = require('../repositories');
const { asyncHandler, notFound } = require('../lib/http');

const router = express.Router();

// Published module index. `?category=` narrows to one resource-library section.
router.get(
  '/modules',
  asyncHandler(async (req, res) => {
    const category =
      req.query.category !== undefined ? String(req.query.category) : undefined;
    const rows = await learningModules.listPublished({ category });
    res.json({ data: rows });
  })
);

// One published module by slug, including its markdown body. An unknown OR
// unpublished slug is an indistinguishable 404 — a draft never leaks.
router.get(
  '/modules/:slug',
  asyncHandler(async (req, res) => {
    const module = await learningModules.findPublishedBySlug(req.params.slug);
    if (!module) throw notFound('module_not_found');
    res.json({ data: module });
  })
);

// The resource library: published modules grouped by category, in display
// order, so the CAT site can render its browse-by-topic index in one request.
router.get(
  '/library',
  asyncHandler(async (req, res) => {
    const rows = await learningModules.listPublished();
    const byCategory = new Map();
    for (const row of rows) {
      // Modules with no category fall under a stable 'general' bucket so they
      // are still browsable rather than silently dropped.
      const key = row.category || 'general';
      if (!byCategory.has(key)) byCategory.set(key, []);
      byCategory.get(key).push(row);
    }
    const data = Array.from(byCategory, ([category, modules]) => ({
      category,
      modules,
    }));
    res.json({ data });
  })
);

module.exports = router;
