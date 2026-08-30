'use strict';

// Central export for the repository/query layer. The simple entity tables use
// the shared factory directly; participants and interactions add guardrail-
// aware helpers in their own modules.

const cohorts = require('./cohorts');
const campaigns = require('./campaigns');
const participants = require('./participants');
const interactions = require('./interactions');
const adminUsers = require('./adminUsers');
const learningModules = require('./learningModules');
const quizzes = require('./quizzes');
const trainingAssignments = require('./trainingAssignments');

module.exports = {
  cohorts,
  campaigns,
  participants,
  interactions,
  adminUsers,
  learningModules,
  quizzes,
  trainingAssignments,
};
