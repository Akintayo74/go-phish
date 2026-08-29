'use strict';

// Central export for the repository/query layer. The simple entity tables use
// the shared factory directly; participants and interactions add guardrail-
// aware helpers in their own modules.

const { createRepository } = require('./base');
const participants = require('./participants');
const interactions = require('./interactions');

module.exports = {
  cohorts: createRepository('cohorts'),
  campaigns: createRepository('campaigns'),
  participants,
  interactions,
  learningModules: createRepository('learning_modules'),
  quizzes: createRepository('quizzes'),
  trainingAssignments: createRepository('training_assignments'),
};
