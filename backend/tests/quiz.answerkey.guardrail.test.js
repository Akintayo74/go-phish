'use strict';

// GUARDRAIL (Phase 7): a quiz's ANSWER KEY must never leave the server. The
// public quiz payload carries prompts + choices only, and grading is done
// server-side, so a reader of the API can never see (nor infer from the payload)
// which choice is correct. This test proves it three ways:
//   1. `quizzes.toPublic` strips `answer_index` from every question and does not
//      mutate the input row.
//   2. The GET /modules/:slug/quiz response body contains no `answer_index`
//      anywhere, even though the repository returns the full keyed row.
//   3. The POST attempt result is aggregate-only — it never echoes the key.
// If a future edit lets the key reach the client, this test fails.
//
// DB-free: the repositories module is mocked.

jest.mock('../src/repositories', () => ({
  learningModules: {},
  quizzes: {
    // The real toPublic/toPublicQuestion are pure — use them so the test guards
    // the actual scrubbing logic, not a stand-in.
    ...jest.requireActual('../src/repositories/quizzes'),
    findByPublishedModuleSlug: jest.fn(),
  },
}));

const request = require('supertest');
const { createApp } = require('../src/app');
const { quizzes } = require('../src/repositories');
const quizRepo = require('../src/repositories/quizzes');

function app() {
  return createApp({ logger: () => {} });
}

// A quiz row as stored: each question carries the answer key.
const KEYED_QUIZ = {
  id: 'q1',
  learning_module_id: 'm1',
  title: 'Phishing Recognition — Knowledge Check',
  pass_threshold: 70,
  questions: [
    {
      prompt: 'Safest action for a "verify now" link?',
      choices: ['Click it', 'Reply creds', 'Go to the official site yourself', 'Forward it'],
      answer_index: 2,
    },
    {
      prompt: 'A bank will legitimately ask you by SMS for…',
      choices: ['Your OTP', 'Your PIN', 'Your password', 'None of these'],
      answer_index: 3,
    },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('toPublic strips the answer key', () => {
  test('every question keeps prompt + choices but never answer_index', () => {
    const pub = quizRepo.toPublic(KEYED_QUIZ);
    expect(pub.questions).toHaveLength(2);
    for (const q of pub.questions) {
      expect(q).toHaveProperty('prompt');
      expect(q).toHaveProperty('choices');
      expect(q).not.toHaveProperty('answer_index');
    }
    // A serialized public quiz contains no trace of the key.
    expect(JSON.stringify(pub)).not.toMatch(/answer_index/);
  });

  test('does not mutate the input row', () => {
    const before = JSON.stringify(KEYED_QUIZ);
    quizRepo.toPublic(KEYED_QUIZ);
    expect(JSON.stringify(KEYED_QUIZ)).toBe(before);
    expect(KEYED_QUIZ.questions[0]).toHaveProperty('answer_index', 2);
  });
});

describe('GET /api/learn/modules/:slug/quiz never returns the key', () => {
  test('response body carries no answer_index even though the repo row does', async () => {
    quizzes.findByPublishedModuleSlug.mockResolvedValue(KEYED_QUIZ);

    const res = await request(app())
      .get('/api/learn/modules/recognizing-phishing/quiz')
      .expect(200);

    expect(JSON.stringify(res.body)).not.toMatch(/answer_index/);
    // Choices are present (renderable) but the key is gone.
    expect(res.body.data.questions[0].choices).toHaveLength(4);
    expect(res.body.data.questions[0]).not.toHaveProperty('answer_index');
  });
});

describe('POST /api/learn/modules/:slug/quiz/attempt returns aggregate-only', () => {
  test('the scored result never echoes the answer key', async () => {
    quizzes.findByPublishedModuleSlug.mockResolvedValue(KEYED_QUIZ);

    const res = await request(app())
      .post('/api/learn/modules/recognizing-phishing/quiz/attempt')
      .send({ answers: [2, 3] })
      .expect(200);

    expect(JSON.stringify(res.body)).not.toMatch(/answer_index/);
    expect(res.body.data).toEqual({
      total: 2,
      correct: 2,
      score: 100,
      passed: true,
      pass_threshold: 70,
    });
  });
});
