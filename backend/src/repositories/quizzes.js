'use strict';

// Quiz repository (Phase 7 — knowledge-check engine).
//
// GUARDRAIL for this phase: the answer key never leaves the server. Each
// question in the `questions` JSONB carries an `answer_index`; `toPublic`
// strips it so the public quiz API can render a question and its choices but
// can never disclose (or let a reader infer from the payload) which choice is
// correct. Scoring is done server-side (services/quiz.js) against the full
// row, so the client is never trusted with — nor told — the key.
//
// Reads are published-only, mirroring the Phase 6 learning-module invariant: a
// quiz attached to a draft/unpublished module must not leak either. No
// participant answers are stored here (see the quizzes migration comment) —
// Phase 8 wires completion tracking off the scored result.

const { createRepository } = require('./base');

const repo = createRepository('quizzes');

// One question with the answer key removed. Only the prompt and the ordered
// choices survive — never `answer_index`.
function toPublicQuestion(q) {
  const question = q && typeof q === 'object' ? q : {};
  return {
    prompt: question.prompt,
    choices: Array.isArray(question.choices) ? question.choices : [],
  };
}

// A quiz row scrubbed for public delivery: the questions carry no answer key.
// Returns the input unchanged when falsy so callers can pass a lookup result
// straight through. Never mutates the input row.
function toPublic(quiz) {
  if (!quiz) return quiz;
  const questions = Array.isArray(quiz.questions) ? quiz.questions : [];
  return {
    id: quiz.id,
    learning_module_id: quiz.learning_module_id,
    title: quiz.title,
    pass_threshold: quiz.pass_threshold,
    questions: questions.map(toPublicQuestion),
  };
}

// The quiz for a PUBLISHED module, by the module's slug. Joins
// `learning_modules` and pins `published = true`, so the quiz of an unknown OR
// unpublished module resolves to `undefined` — indistinguishable to the caller,
// so a draft's quiz never leaks (same contract as findPublishedBySlug in
// Phase 6). Returns the full row (with the answer key) for server-side scoring;
// route handlers must run it through `toPublic` before responding.
async function findByPublishedModuleSlug(slug, trx) {
  return repo
    .query(trx)
    .join('learning_modules', 'quizzes.learning_module_id', 'learning_modules.id')
    .where('learning_modules.slug', slug)
    .andWhere('learning_modules.published', true)
    .select('quizzes.*')
    .first();
}

module.exports = {
  ...repo,
  toPublicQuestion,
  toPublic,
  findByPublishedModuleSlug,
};
