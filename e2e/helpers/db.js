'use strict';

// Out-of-band DB oracle for the E2E.
//
// The CAT-Sim API is aggregate-only by design: a send returns counts, never the
// per-participant tracking token (guardrail #5), and the completion token is only
// ever emailed. An end-to-end test still needs those opaque tokens to "be" the
// participant following their link. The test harness reads them straight from the
// database it shares with the backend — a legitimate test oracle that does NOT
// weaken the app's guarantee (no token endpoint is added to the product).

const knex = require('knex');

function db() {
  const connection =
    process.env.DATABASE_URL || 'postgres://catsim:catsim@localhost:5432/catsim_test';
  return knex({ client: 'pg', connection, pool: { min: 0, max: 5 } });
}

// The tracking token minted for a (campaign, participant) at send time.
async function trackingTokenFor(conn, campaignId, participantId) {
  const row = await conn('interactions')
    .where({ campaign_id: campaignId, participant_id: participantId })
    .first('tracking_token');
  return row && row.tracking_token;
}

// The completion token of the assignment the enrollment loop created.
async function completionTokenFor(conn, campaignId, participantId) {
  const row = await conn('training_assignments')
    .where({ campaign_id: campaignId, participant_id: participantId })
    .orderBy('assigned_at', 'asc')
    .first('completion_token');
  return row && row.completion_token;
}

// The behavioral flags recorded for a (campaign, participant), so the spec can
// assert what the participant's actions recorded.
async function interactionFlags(conn, campaignId, participantId) {
  return conn('interactions')
    .where({ campaign_id: campaignId, participant_id: participantId })
    .first('opened', 'clicked', 'submitted', 'disclosed');
}

// The correct answer key for a module's quiz, as a dense array of choice
// indices. Used only by the harness to complete the knowledge check — the
// product never exposes the key to a client (Phase 7 guardrail); the E2E reads
// it from the DB purely as a test oracle so it can drive a genuine PASS.
async function correctAnswersFor(conn, moduleSlug) {
  const row = await conn('quizzes')
    .join('learning_modules', 'quizzes.learning_module_id', 'learning_modules.id')
    .where('learning_modules.slug', moduleSlug)
    .first('quizzes.questions as questions');
  if (!row) return null;
  const questions = typeof row.questions === 'string' ? JSON.parse(row.questions) : row.questions;
  return (questions || []).map((q) => q.answer_index);
}

module.exports = {
  db,
  trackingTokenFor,
  completionTokenFor,
  interactionFlags,
  correctAnswersFor,
};
