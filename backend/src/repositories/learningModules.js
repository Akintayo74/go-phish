'use strict';

// Learning-module repository (Phase 6 — CAT platform content).
//
// The CAT learning site is PUBLIC and UNAUTHENTICATED, so the read helpers here
// are the front door to whatever content the world can see. They expose only
// `published = true` modules: a draft/unpublished module (authored but not yet
// ready) must never leak through the public API. `listPublished` /
// `findPublishedBySlug` are the only methods the public route calls; the
// inherited generic methods (which can see unpublished rows) stay for
// future admin authoring but are not wired to any public endpoint.

const { createRepository } = require('./base');

const repo = createRepository('learning_modules');

// The columns safe to return in a list view (the resource-library index). The
// full `body_markdown` is intentionally omitted from lists — a reader fetches
// one module by slug to get its body.
const LIST_COLUMNS = ['id', 'slug', 'title', 'summary', 'category', 'order_index'];

// All published modules, ordered for display. Optionally filtered to one
// category (for the resource library's per-category sections).
async function listPublished({ category } = {}, trx) {
  const q = repo
    .query(trx)
    .where({ published: true })
    .select(LIST_COLUMNS)
    .orderBy([
      { column: 'category', order: 'asc' },
      { column: 'order_index', order: 'asc' },
      { column: 'title', order: 'asc' },
    ]);
  if (category !== undefined) q.andWhere({ category });
  return q;
}

// One published module by slug (full body). Returns undefined for an unknown
// slug OR an unpublished one — the caller cannot tell the two apart, so a draft
// module's existence never leaks.
async function findPublishedBySlug(slug, trx) {
  return repo.query(trx).where({ slug, published: true }).first();
}

// The distinct categories that have at least one published module, in display
// order — used to build the resource-library grouping.
async function listPublishedCategories(trx) {
  const rows = await repo
    .query(trx)
    .where({ published: true })
    .whereNotNull('category')
    .distinct('category')
    .orderBy('category', 'asc');
  return rows.map((r) => r.category);
}

module.exports = {
  ...repo,
  LIST_COLUMNS,
  listPublished,
  findPublishedBySlug,
  listPublishedCategories,
};
