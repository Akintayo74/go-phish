'use strict';

// Unit tests for the Phase 7 scoring engine (services/quiz.js). Pure functions,
// no DB. Scoring must be exact against `pass_threshold`, tolerant of malformed
// answer payloads, and never crash on odd input.

const { scoreQuiz, normalizeAnswers } = require('../src/services/quiz');

const QUIZ = {
  pass_threshold: 70,
  questions: [
    { prompt: 'q1', choices: ['a', 'b', 'c'], answer_index: 2 },
    { prompt: 'q2', choices: ['a', 'b'], answer_index: 0 },
    { prompt: 'q3', choices: ['a', 'b', 'c', 'd'], answer_index: 3 },
    { prompt: 'q4', choices: ['a', 'b'], answer_index: 1 },
  ],
};

describe('normalizeAnswers', () => {
  test('pads to the question count and nulls non-integers / missing entries', () => {
    expect(normalizeAnswers([2, 'x', undefined, 1], 4)).toEqual([2, null, null, 1]);
  });

  test('a non-array payload becomes all-null (all unanswered)', () => {
    expect(normalizeAnswers(undefined, 3)).toEqual([null, null, null]);
    expect(normalizeAnswers(null, 2)).toEqual([null, null]);
  });

  test('extra answers beyond the question count are ignored', () => {
    expect(normalizeAnswers([0, 1, 2, 3, 4, 5], 2)).toEqual([0, 1]);
  });
});

describe('scoreQuiz', () => {
  test('all correct → 100 and passed', () => {
    expect(scoreQuiz(QUIZ, [2, 0, 3, 1])).toEqual({
      total: 4,
      correct: 4,
      score: 100,
      passed: true,
      pass_threshold: 70,
    });
  });

  test('half correct → 50 and not passed against a 70 threshold', () => {
    expect(scoreQuiz(QUIZ, [2, 0, 0, 0])).toEqual({
      total: 4,
      correct: 2,
      score: 50,
      passed: false,
      pass_threshold: 70,
    });
  });

  test('three of four correct → 75, which clears a 70 threshold', () => {
    expect(scoreQuiz(QUIZ, [2, 0, 3, 0])).toMatchObject({ correct: 3, score: 75, passed: true });
  });

  test('a score exactly at the threshold passes (>=)', () => {
    const half = { pass_threshold: 50, questions: QUIZ.questions };
    expect(scoreQuiz(half, [2, 0, 0, 0])).toMatchObject({ score: 50, passed: true });
  });

  test('unanswered questions count as incorrect', () => {
    expect(scoreQuiz(QUIZ, [2])).toMatchObject({ total: 4, correct: 1, score: 25, passed: false });
  });

  test('a wrong-but-integer answer is simply incorrect', () => {
    expect(scoreQuiz(QUIZ, [0, 1, 0, 0])).toMatchObject({ correct: 0, score: 0, passed: false });
  });

  test('missing / non-array answers score zero without throwing', () => {
    expect(scoreQuiz(QUIZ, undefined)).toMatchObject({ correct: 0, score: 0, passed: false });
  });

  test('a quiz with no questions cannot be passed', () => {
    expect(scoreQuiz({ pass_threshold: 70, questions: [] }, [])).toEqual({
      total: 0,
      correct: 0,
      score: 0,
      passed: false,
      pass_threshold: 70,
    });
  });

  test('defaults the threshold to 70 when the row omits a valid one', () => {
    expect(scoreQuiz({ questions: QUIZ.questions }, [2, 0, 3, 1])).toMatchObject({
      pass_threshold: 70,
      passed: true,
    });
  });
});
