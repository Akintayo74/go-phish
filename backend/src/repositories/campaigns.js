'use strict';

// Campaign repository (Phase 3). Wraps the base factory and adds the lifecycle
// transition helper. Like cohort consent, a campaign's `status` is never set
// through create/update — it moves only via explicit transitions, so the state
// machine lives in one auditable place (routes/campaigns.js drives it).
//
// Phase 10 adds re-test support: `clone` derives a new draft campaign from an
// existing one (carrying its definition, never its behavioral data), and
// `lineage` returns the full phase family so Phase I / Phase II can be compared
// side by side.

const { db } = require('../db');
const { createRepository } = require('./base');

const repo = createRepository('campaigns');

async function setStatus(id, status, trx) {
  return repo.update(id, { status }, trx);
}

// --- Phase 10: cloning -----------------------------------------------------

// Pure derivation of a clone's insert attributes from its source. Copies only
// the campaign *definition*; deliberately omits `status` (so the schema default
// 'draft' applies — a clone is never born live) and `scheduled_send_at` (a
// re-test is scheduled fresh). Behavioral rows (interactions, assignments) are
// never copied — they belong to the phase that produced them. `overrides` may
// replace any of name/description/phase_label/enrollment_trigger; anything not
// overridden falls back to the source value.
function cloneAttrs(source, overrides = {}) {
  const pick = (key) =>
    overrides[key] !== undefined ? overrides[key] : source[key] ?? null;
  return {
    name: pick('name'),
    description: pick('description'),
    phase_label: pick('phase_label'),
    enrollment_trigger: pick('enrollment_trigger'),
    cloned_from_campaign_id: source.id,
  };
}

// Clone a campaign as a new draft phase. Returns undefined if the source is
// gone (the route maps that to 404).
async function clone(sourceId, overrides = {}, trx) {
  const source = await repo.findById(sourceId, trx);
  if (!source) return undefined;
  return repo.create(cloneAttrs(source, overrides), trx);
}

// --- Phase 10: lineage -----------------------------------------------------

// Pure: given the full set of campaign rows and any campaign id in a family,
// return that family — the root (walking up `cloned_from_campaign_id`) plus all
// descendants — ordered oldest-first (created_at, id as a stable tiebreak). A
// campaign that was never cloned returns just itself. Guards against cycles
// (which the clone path cannot create, but a hand-edited row could).
function buildLineage(rows, id) {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const start = byId.get(id);
  if (!start) return [];

  // Walk up to the root of the family.
  let root = start;
  const climbed = new Set([root.id]);
  while (
    root.cloned_from_campaign_id &&
    byId.has(root.cloned_from_campaign_id) &&
    !climbed.has(root.cloned_from_campaign_id)
  ) {
    root = byId.get(root.cloned_from_campaign_id);
    climbed.add(root.id);
  }

  // Index children by parent, then breadth-first collect the whole subtree.
  const childrenOf = new Map();
  for (const r of rows) {
    const parent = r.cloned_from_campaign_id;
    if (!parent) continue;
    if (!childrenOf.has(parent)) childrenOf.set(parent, []);
    childrenOf.get(parent).push(r);
  }

  const family = [];
  const seen = new Set();
  const queue = [root];
  while (queue.length > 0) {
    const node = queue.shift();
    if (seen.has(node.id)) continue;
    seen.add(node.id);
    family.push(node);
    for (const child of childrenOf.get(node.id) || []) queue.push(child);
  }

  family.sort((a, b) => {
    const ta = new Date(a.created_at).getTime();
    const tb = new Date(b.created_at).getTime();
    if (ta !== tb) return ta - tb;
    return String(a.id).localeCompare(String(b.id));
  });
  return family;
}

// The phase family for a campaign. MVP scale by design: the campaign set is
// small, so we pull the rows and compute the family in one auditable place
// rather than in SQL (mirrors the analytics repo's approach).
async function lineage(id, trx) {
  const conn = trx || db;
  const rows = await conn('campaigns').select('*');
  return buildLineage(rows, id);
}

module.exports = {
  ...repo,
  setStatus,
  clone,
  lineage,
  // pure helpers (exported for unit tests)
  cloneAttrs,
  buildLineage,
};
