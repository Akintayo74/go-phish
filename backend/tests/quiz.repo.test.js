'use strict';

// GUARDRAIL (Phase 7, published-only): a quiz attached to a draft/unpublished
// module must not be reachable through the public API — mirroring the Phase 6
// learning-module invariant. `findByPublishedModuleSlug` joins the module and
// must pin `published = true`. This drives it through a recording query stub
// (no DB) and asserts that filter is present; if a future edit drops it (so a
// draft module's quiz could leak), this test fails.

const quizzes = require('../src/repositories/quizzes');

function makeBuilder(first) {
  const calls = { join: [], where: [], andWhere: [], select: [] };
  const builder = {
    join(...args) {
      calls.join.push(args);
      return builder;
    },
    where(...args) {
      calls.where.push(args);
      return builder;
    },
    andWhere(...args) {
      calls.andWhere.push(args);
      return builder;
    },
    select(...args) {
      calls.select.push(args);
      return builder;
    },
    first() {
      return Promise.resolve(first);
    },
    calls,
  };
  return builder;
}

// A `trx` is any function of (table) → builder; base repo's query() calls it.
const trxReturning = (builder) => () => builder;

describe('findByPublishedModuleSlug is published-only', () => {
  test('joins learning_modules and pins published = true', async () => {
    const builder = makeBuilder(undefined);
    const found = await quizzes.findByPublishedModuleSlug('draft-slug', trxReturning(builder));

    // Joined to the module table.
    expect(builder.calls.join[0][0]).toBe('learning_modules');
    // Filtered by the requested slug.
    expect(builder.calls.where).toContainEqual(['learning_modules.slug', 'draft-slug']);
    // ...and pinned to published modules only.
    expect(builder.calls.andWhere).toContainEqual(['learning_modules.published', true]);
    // Unknown/unpublished → undefined (indistinguishable to the caller).
    expect(found).toBeUndefined();
  });

  test('selects only the quiz columns (not the joined module row)', async () => {
    const builder = makeBuilder({ id: 'q1' });
    await quizzes.findByPublishedModuleSlug('a-slug', trxReturning(builder));
    expect(builder.calls.select).toContainEqual(['quizzes.*']);
  });
});
