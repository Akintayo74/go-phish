'use strict';

/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  clearMocks: true,
  // Fail fast if a test leaks async handles (e.g. an open DB pool).
  detectOpenHandles: false,
};
