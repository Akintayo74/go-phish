'use strict';

// Phase 8 enroll/completion route contract. Repositories are mocked so the
// routes run without a database. Covers: GET returns the assignment + assigned
// module and starts it (assigned → in_progress); the quiz attempt is scored
// server-side and a pass marks the assignment completed; unknown tokens and a
// module with no quiz 404; a non-array answers body 400s. Also pins that the
// response never echoes the participant id, the completion token, or the answer
// key.

jest.mock('../src/repositories', () => ({
  trainingAssignments: {
    findByToken: jest.fn(),
    markInProgress: jest.fn(),
    markCompleted: jest.fn(),
    toPublic: jest.requireActual('../src/repositories/trainingAssignments').toPublic,
  },
  learningModules: { findById: jest.fn() },
  quizzes: { findByModuleId: jest.fn() },
}));

const request = require('supertest');
const { createApp } = require('../src/app');
const { trainingAssignments, learningModules, quizzes } = require('../src/repositories');

const TOKEN = 'ctok_123';
function app() {
  return createApp({ logger: () => {} });
}

const ASSIGNMENT = {
  id: 'ta-1',
  participant_id: 'p-secret',
  learning_module_id: 'mod-1',
  campaign_id: 'camp-1',
  assigned_reason: 'submitted_form',
  status: 'assigned',
  assigned_at: '2026-01-01T00:00:00.000Z',
  completed_at: null,
  completion_token: TOKEN,
};

const MODULE = {
  id: 'mod-1',
  slug: 'recognizing-phishing',
  title: 'Recognize Phishing',
  summary: 'Spot the signs.',
  category: 'phishing',
};

const QUIZ = {
  id: 'q-1',
  learning_module_id: 'mod-1',
  pass_threshold: 70,
  questions: [
    { prompt: 'Q1', choices: ['a', 'b'], answer_index: 1 },
    { prompt: 'Q2', choices: ['a', 'b'], answer_index: 0 },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('GET /api/enroll/:token', () => {
  test('returns the assignment + module and starts it (assigned → in_progress)', async () => {
    trainingAssignments.findByToken.mockResolvedValue({ ...ASSIGNMENT });
    trainingAssignments.markInProgress.mockResolvedValue({ ...ASSIGNMENT, status: 'in_progress' });
    learningModules.findById.mockResolvedValue(MODULE);

    const res = await request(app()).get(`/api/enroll/${TOKEN}`).expect(200);

    expect(trainingAssignments.markInProgress).toHaveBeenCalledWith('ta-1');
    expect(res.body.data.assignment.status).toBe('in_progress');
    expect(res.body.data.module.slug).toBe('recognizing-phishing');
    // Never echoes the participant id or the token back.
    const flat = JSON.stringify(res.body);
    expect(flat).not.toContain('p-secret');
    expect(flat).not.toContain(TOKEN);
  });

  test('404 for an unknown token', async () => {
    trainingAssignments.findByToken.mockResolvedValue(undefined);
    const res = await request(app()).get(`/api/enroll/${TOKEN}`).expect(404);
    expect(res.body.error).toBe('assignment_not_found');
    expect(trainingAssignments.markInProgress).not.toHaveBeenCalled();
  });

  test('does not re-start an already in_progress/completed assignment', async () => {
    trainingAssignments.findByToken.mockResolvedValue({ ...ASSIGNMENT, status: 'completed' });
    learningModules.findById.mockResolvedValue(MODULE);
    await request(app()).get(`/api/enroll/${TOKEN}`).expect(200);
    expect(trainingAssignments.markInProgress).not.toHaveBeenCalled();
  });
});

describe('POST /api/enroll/:token/quiz/attempt', () => {
  test('a passing attempt marks the assignment completed; no answer key leaks', async () => {
    trainingAssignments.findByToken.mockResolvedValue({ ...ASSIGNMENT });
    quizzes.findByModuleId.mockResolvedValue(QUIZ);
    trainingAssignments.markCompleted.mockResolvedValue({ ...ASSIGNMENT, status: 'completed' });

    const res = await request(app())
      .post(`/api/enroll/${TOKEN}/quiz/attempt`)
      .send({ answers: [1, 0] })
      .expect(200);

    expect(res.body.data.passed).toBe(true);
    expect(res.body.data.score).toBe(100);
    expect(res.body.data.assignment_status).toBe('completed');
    expect(trainingAssignments.markCompleted).toHaveBeenCalledWith('ta-1');
    expect(JSON.stringify(res.body)).not.toContain('answer_index');
  });

  test('a failing attempt does not complete the assignment', async () => {
    trainingAssignments.findByToken.mockResolvedValue({ ...ASSIGNMENT });
    quizzes.findByModuleId.mockResolvedValue(QUIZ);

    const res = await request(app())
      .post(`/api/enroll/${TOKEN}/quiz/attempt`)
      .send({ answers: [0, 1] })
      .expect(200);

    expect(res.body.data.passed).toBe(false);
    expect(res.body.data.assignment_status).toBe('assigned');
    expect(trainingAssignments.markCompleted).not.toHaveBeenCalled();
  });

  test('404 for an unknown token, before scoring', async () => {
    trainingAssignments.findByToken.mockResolvedValue(undefined);
    await request(app())
      .post(`/api/enroll/${TOKEN}/quiz/attempt`)
      .send({ answers: [1, 0] })
      .expect(404);
    expect(quizzes.findByModuleId).not.toHaveBeenCalled();
  });

  test('404 when the assigned module has no quiz', async () => {
    trainingAssignments.findByToken.mockResolvedValue({ ...ASSIGNMENT });
    quizzes.findByModuleId.mockResolvedValue(undefined);
    const res = await request(app())
      .post(`/api/enroll/${TOKEN}/quiz/attempt`)
      .send({ answers: [1, 0] })
      .expect(404);
    expect(res.body.error).toBe('quiz_not_found');
  });

  test('400 for a non-array answers body', async () => {
    trainingAssignments.findByToken.mockResolvedValue({ ...ASSIGNMENT });
    quizzes.findByModuleId.mockResolvedValue(QUIZ);
    const res = await request(app())
      .post(`/api/enroll/${TOKEN}/quiz/attempt`)
      .send({ answers: 'nope' })
      .expect(400);
    expect(res.body.error).toBe('answers_must_be_array');
  });
});
