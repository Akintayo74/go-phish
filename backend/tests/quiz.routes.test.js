'use strict';

// Public quiz API contract (Phase 7). The repository is mocked so the routes are
// tested without a database. Both endpoints are PUBLIC — no auth header is sent,
// and the routes must never require one (the CAT site is open to anyone).

jest.mock('../src/repositories', () => ({
  learningModules: {},
  quizzes: {
    ...jest.requireActual('../src/repositories/quizzes'),
    findByPublishedModuleSlug: jest.fn(),
  },
}));

const request = require('supertest');
const { createApp } = require('../src/app');
const { quizzes } = require('../src/repositories');

function app() {
  return createApp({ logger: () => {} });
}

const QUIZ = {
  id: 'q1',
  learning_module_id: 'm1',
  title: 'Knowledge Check',
  pass_threshold: 70,
  questions: [
    { prompt: 'q1', choices: ['a', 'b', 'c'], answer_index: 2 },
    { prompt: 'q2', choices: ['a', 'b'], answer_index: 0 },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('GET /api/learn/modules/:slug/quiz', () => {
  test('is public and returns the module quiz without the answer key', async () => {
    quizzes.findByPublishedModuleSlug.mockResolvedValue(QUIZ);

    const res = await request(app())
      .get('/api/learn/modules/recognizing-phishing/quiz')
      .expect(200);

    expect(quizzes.findByPublishedModuleSlug).toHaveBeenCalledWith('recognizing-phishing');
    expect(res.body.data).toEqual({
      id: 'q1',
      learning_module_id: 'm1',
      title: 'Knowledge Check',
      pass_threshold: 70,
      questions: [
        { prompt: 'q1', choices: ['a', 'b', 'c'] },
        { prompt: 'q2', choices: ['a', 'b'] },
      ],
    });
  });

  test('an unknown/unpublished module (no quiz) is an indistinguishable 404', async () => {
    quizzes.findByPublishedModuleSlug.mockResolvedValue(undefined);
    const res = await request(app()).get('/api/learn/modules/draft-or-missing/quiz').expect(404);
    expect(res.body).toEqual({ error: 'quiz_not_found' });
  });
});

describe('POST /api/learn/modules/:slug/quiz/attempt', () => {
  test('scores a passing attempt server-side', async () => {
    quizzes.findByPublishedModuleSlug.mockResolvedValue(QUIZ);

    const res = await request(app())
      .post('/api/learn/modules/recognizing-phishing/quiz/attempt')
      .send({ answers: [2, 0] })
      .expect(200);

    expect(res.body.data).toEqual({
      total: 2,
      correct: 2,
      score: 100,
      passed: true,
      pass_threshold: 70,
    });
  });

  test('scores a failing attempt', async () => {
    quizzes.findByPublishedModuleSlug.mockResolvedValue(QUIZ);
    const res = await request(app())
      .post('/api/learn/modules/recognizing-phishing/quiz/attempt')
      .send({ answers: [0, 1] })
      .expect(200);
    expect(res.body.data).toMatchObject({ correct: 0, score: 0, passed: false });
  });

  test('a missing answers array scores zero rather than erroring', async () => {
    quizzes.findByPublishedModuleSlug.mockResolvedValue(QUIZ);
    const res = await request(app())
      .post('/api/learn/modules/recognizing-phishing/quiz/attempt')
      .send({})
      .expect(200);
    expect(res.body.data).toMatchObject({ total: 2, correct: 0, passed: false });
  });

  test('a non-array answers value is a 400', async () => {
    quizzes.findByPublishedModuleSlug.mockResolvedValue(QUIZ);
    const res = await request(app())
      .post('/api/learn/modules/recognizing-phishing/quiz/attempt')
      .send({ answers: 'nope' })
      .expect(400);
    expect(res.body).toEqual({ error: 'answers_must_be_array' });
  });

  test('attempting the quiz of an unknown/unpublished module is a 404', async () => {
    quizzes.findByPublishedModuleSlug.mockResolvedValue(undefined);
    const res = await request(app())
      .post('/api/learn/modules/draft-or-missing/quiz/attempt')
      .send({ answers: [0] })
      .expect(404);
    expect(res.body).toEqual({ error: 'quiz_not_found' });
  });
});
