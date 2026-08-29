'use strict';

// GUARDRAIL (Phase 6): the public CAT learning site must expose ONLY published
// modules. A draft/unpublished module — authored but not yet ready — must never
// be reachable through the public read paths. This test drives the repository's
// published-only accessors through a recording query stub and proves every one
// of them pins `published: true` in its filter. If a future edit drops that
// filter (so drafts could leak), this test fails.
//
// DB-free: `repo.query(trx)` calls `trx(table)`, so passing a `trx` that returns
// our chainable stub intercepts the whole query without a database.

const learningModules = require('../src/repositories/learningModules');

function makeBuilder({ rows = [], first = undefined } = {}) {
  const calls = { where: [], andWhere: [], whereNotNull: [], distinct: [], orderBy: [], select: [] };
  const builder = {
    where(arg) {
      calls.where.push(arg);
      return builder;
    },
    andWhere(arg) {
      calls.andWhere.push(arg);
      return builder;
    },
    whereNotNull(arg) {
      calls.whereNotNull.push(arg);
      return builder;
    },
    distinct(arg) {
      calls.distinct.push(arg);
      return builder;
    },
    select(arg) {
      calls.select.push(arg);
      return builder;
    },
    orderBy(arg) {
      calls.orderBy.push(arg);
      return builder;
    },
    first() {
      return Promise.resolve(first);
    },
    // Thenable so `await builder` (a list query) resolves to the rows.
    then(resolve, reject) {
      return Promise.resolve(rows).then(resolve, reject);
    },
    calls,
  };
  return builder;
}

// A `trx` is any function of (table) → builder; base repo's query() calls it.
function trxReturning(builder) {
  return () => builder;
}

// True if any recorded where/andWhere criteria object pins published: true.
function pinsPublished(builder) {
  return [...builder.calls.where, ...builder.calls.andWhere].some(
    (c) => c && typeof c === 'object' && c.published === true
  );
}

describe('learning-module public reads are published-only', () => {
  test('listPublished filters on published = true', async () => {
    const builder = makeBuilder({ rows: [{ slug: 'a' }] });
    await learningModules.listPublished({}, trxReturning(builder));
    expect(pinsPublished(builder)).toBe(true);
  });

  test('listPublished with a category still pins published = true', async () => {
    const builder = makeBuilder({ rows: [] });
    await learningModules.listPublished({ category: 'phishing' }, trxReturning(builder));
    expect(pinsPublished(builder)).toBe(true);
    // ...and applies the category as an additional filter, not a replacement.
    expect(builder.calls.andWhere).toContainEqual({ category: 'phishing' });
  });

  test('findPublishedBySlug pins published = true (a draft slug is invisible)', async () => {
    const builder = makeBuilder({ first: undefined });
    const found = await learningModules.findPublishedBySlug('draft-slug', trxReturning(builder));
    expect(pinsPublished(builder)).toBe(true);
    expect(builder.calls.where[0]).toMatchObject({ slug: 'draft-slug', published: true });
    // Unknown/unpublished → undefined (indistinguishable to the caller).
    expect(found).toBeUndefined();
  });

  test('listPublishedCategories only counts published modules', async () => {
    const builder = makeBuilder({ rows: [{ category: 'phishing' }, { category: 'fundamentals' }] });
    const cats = await learningModules.listPublishedCategories(trxReturning(builder));
    expect(pinsPublished(builder)).toBe(true);
    expect(cats).toEqual(['phishing', 'fundamentals']);
  });

  test('the list view never selects the raw body column', async () => {
    // The list/index columns are metadata only; the body is fetched per-module.
    expect(learningModules.LIST_COLUMNS).not.toContain('body_markdown');
  });
});
