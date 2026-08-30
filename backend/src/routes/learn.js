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
//   GET  /api/learn/modules            → published module index (metadata only),
//                                         optionally ?category=<slug>
//   GET  /api/learn/modules/:slug      → one published module, with its body
//   GET  /api/learn/library            → resource library grouped by category
//
// Phase 7 adds the knowledge-check engine alongside the module reads:
//   GET  /api/learn/modules/:slug/quiz         → the module's quiz WITHOUT the
//                                                 answer key (server strips it)
//   POST /api/learn/modules/:slug/quiz/attempt → score an attempt server-side
//
// Only `published = true` modules (and their quizzes) are ever exposed here (see
// repositories/learningModules.js and repositories/quizzes.js) — a draft module
// cannot leak to the public, and a quiz's answer key never leaves the server.

const express = require('express');
const { learningModules, quizzes } = require('../repositories');
const { scoreQuiz } = require('../services/quiz');
const { asyncHandler, notFound, badRequest } = require('../lib/http');

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

// A published module's knowledge-check quiz, WITHOUT the answer key. Each
// question's `answer_index` is stripped server-side (quizzes.toPublic) so the
// client can render + answer but can never read or infer the correct choice. A
// module with no quiz — or an unknown/unpublished one — is an indistinguishable
// 404, so a draft's quiz never leaks.
router.get(
  '/modules/:slug/quiz',
  asyncHandler(async (req, res) => {
    const quiz = await quizzes.findByPublishedModuleSlug(req.params.slug);
    if (!quiz) throw notFound('quiz_not_found');
    res.json({ data: quizzes.toPublic(quiz) });
  })
);

// Score an attempt at a module's quiz. The taker submits `{ answers: [...] }`
// (choice index per question); the server grades it against the private answer
// key and returns an aggregate-only result (counts + score + pass/fail).
// STATELESS: nothing is persisted here — Phase 8 wires completion tracking off
// this result. Public (no auth), and the posted body is excluded from logs by
// the global request logger.
router.post(
  '/modules/:slug/quiz/attempt',
  asyncHandler(async (req, res) => {
    const quiz = await quizzes.findByPublishedModuleSlug(req.params.slug);
    if (!quiz) throw notFound('quiz_not_found');

    const answers = req.body ? req.body.answers : undefined;
    if (answers !== undefined && !Array.isArray(answers)) {
      throw badRequest('answers_must_be_array');
    }

    res.json({ data: scoreQuiz(quiz, answers) });
  })
);

module.exports = router;
