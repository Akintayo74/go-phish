'use strict';

// ============================================================================
// PHASE 8 — Enrollment / training-completion routes.
// ============================================================================
//
// These routes are PARTICIPANT-FACING and UNAUTHENTICATED, reached from the
// enrollment notification email by an opaque `:token` (the assignment's
// `completion_token`). They are the bridge that lets an enrolled participant
// complete THEIR specific assignment while the CAT learning site stays fully
// anonymous — the token authorizes the completion, so no participant login is
// needed and nothing about who reads what is recorded beyond the assignment's
// own status (guardrail #6).
//
//   GET  /api/enroll/:token              → the assignment + its assigned module
//                                          (marks it in_progress on first view)
//   POST /api/enroll/:token/quiz/attempt → score the module's knowledge check
//                                          server-side; a pass marks the
//                                          assignment completed
//
// The response never echoes the participant id or the token, and completion is
// decided by SERVER-SIDE scoring (the answer key never leaves the server —
// Phase 7 guardrail), so a client cannot self-report a pass.

const express = require('express');
const { trainingAssignments, learningModules, quizzes } = require('../repositories');
const { asyncHandler, notFound, badRequest } = require('../lib/http');
const { scoreQuiz } = require('../services/quiz');
const { nextResimulationDate } = require('../services/enrollment');

const router = express.Router();

async function loadAssignment(token) {
  const assignment = await trainingAssignments.findByToken(token);
  if (!assignment) throw notFound('assignment_not_found');
  return assignment;
}

// The assignment behind a token, plus the module it points at, so the frontend
// can render "you were enrolled in <module>" and load the lesson + quiz.
router.get(
  '/:token',
  asyncHandler(async (req, res) => {
    const assignment = await loadAssignment(req.params.token);

    // Viewing the training starts it (assigned → in_progress). Best-effort:
    // never let this housekeeping fail the read.
    if (assignment.status === 'assigned') {
      const advanced = await trainingAssignments.markInProgress(assignment.id);
      if (advanced) assignment.status = advanced.status;
    }

    const module = await learningModules.findById(assignment.learning_module_id);

    res.json({
      data: {
        assignment: trainingAssignments.toPublic(assignment),
        module: module
          ? {
              slug: module.slug,
              title: module.title,
              summary: module.summary,
              category: module.category,
            }
          : null,
        resimulate_after: nextResimulationDate(assignment),
      },
    });
  })
);

// Score the assigned module's knowledge check and, on a pass, mark the
// assignment completed. Scoring is server-side against the private answer key
// (guardrail: the key never leaves the server), so completion cannot be faked
// by the client. Stateless w.r.t. answers — only the aggregate outcome and the
// completed flag are persisted (never the submitted answers).
router.post(
  '/:token/quiz/attempt',
  asyncHandler(async (req, res) => {
    const assignment = await loadAssignment(req.params.token);

    const quiz = await quizzes.findByModuleId(assignment.learning_module_id);
    if (!quiz) throw notFound('quiz_not_found');

    const body = req.body || {};
    if (body.answers !== undefined && !Array.isArray(body.answers)) {
      throw badRequest('answers_must_be_array');
    }

    const result = scoreQuiz(quiz, body.answers);

    let status = assignment.status;
    if (result.passed && assignment.status !== 'completed') {
      const completed = await trainingAssignments.markCompleted(assignment.id);
      status = completed ? completed.status : 'completed';
    }

    res.json({ data: { ...result, assignment_status: status } });
  })
);

module.exports = router;
