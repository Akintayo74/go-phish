'use strict';

// Phase 7 — quiz scoring engine.
//
// GUARDRAIL: the answer key lives only on the server. The public quiz API
// strips `answer_index` (repositories/quizzes.toPublic); scoring happens here,
// against the full row, so a submitted attempt is graded without the client
// ever seeing or being told the correct answers. Stateless by design — no
// participant answers are persisted (see the quizzes migration comment). Phase
// 8 keys completion tracking off the returned aggregate result.

// Coerce a raw `answers` payload into an array of chosen choice indices, one per
// question. A missing / non-integer / out-of-position entry becomes `null`
// (treated as unanswered — i.e. incorrect), so a malformed body can never crash
// scoring or be counted as correct.
function normalizeAnswers(answers, count) {
  const out = new Array(count).fill(null);
  if (Array.isArray(answers)) {
    for (let i = 0; i < count; i += 1) {
      const v = answers[i];
      out[i] = Number.isInteger(v) ? v : null;
    }
  }
  return out;
}

// Grade an attempt. `quiz` is the full row (with each question's `answer_index`);
// `answers[i]` is the choice index the taker selected for question i. Returns an
// aggregate-only result — counts + percentage + pass/fail — never a per-question
// answer key, so scoring reveals nothing a re-take could exploit beyond the
// score itself.
function scoreQuiz(quiz, answers) {
  const questions = Array.isArray(quiz && quiz.questions) ? quiz.questions : [];
  const total = questions.length;
  const chosen = normalizeAnswers(answers, total);

  let correct = 0;
  for (let i = 0; i < total; i += 1) {
    const key = questions[i] && questions[i].answer_index;
    if (chosen[i] !== null && Number.isInteger(key) && chosen[i] === key) {
      correct += 1;
    }
  }

  const score = total === 0 ? 0 : Math.round((correct / total) * 100);
  const threshold = Number.isInteger(quiz && quiz.pass_threshold) ? quiz.pass_threshold : 70;
  // A quiz with no questions cannot be "passed" — there is nothing to answer.
  const passed = total > 0 && score >= threshold;

  return { total, correct, score, passed, pass_threshold: threshold };
}

module.exports = { normalizeAnswers, scoreQuiz };
