'use strict';

// Analytics service (Phase 9) — GUARDRAIL-CRITICAL (guardrail #5, aggregate-only).
//
// Every management/researcher-facing number this module produces is an AGGREGATE
// over a group (a cohort or a department) — never a per-individual result. Two
// invariants, pinned by tests/analytics.guardrail.test.js, keep that safe:
//
//   1. No identifier is ever emitted. The service consumes only the group
//      dimension + behavioral flags/status the repository selects (see
//      repositories/analytics.js) and returns counts/rates only. Even if a row
//      carried an identifier, the aggregation drops everything but its group and
//      outcome — nothing per-individual can reach the output.
//
//   2. Small-group suppression (k-anonymity). A group with fewer than
//      `minGroupSize` participants is NEVER reported with its own counts —
//      otherwise a group of one would turn an "aggregate" into that one person's
//      result. Such groups collapse into a single `suppressed` summary exposing
//      only HOW MANY groups and participants were withheld (a bare count, no
//      outcome). The whole-campaign total is itself treated as a group: a
//      campaign with fewer than `minGroupSize` targets has its totals suppressed
//      too, and when totals are suppressed every group is (each group <= total).
//
// The four susceptibility tiers are mutually exclusive and computed by priority
// (submitted > clicked > opened > none), so they always sum to the group total
// regardless of whether the underlying flags are strictly monotonic.

const config = require('../config');
const repositories = require('../repositories');
const { notFound, badRequest } = require('../lib/http');

const GROUP_BYS = ['cohort', 'department'];

// Human-readable fallbacks for a missing group dimension. A participant always
// has a cohort (FK, NOT NULL) but department is optional; keep both defensive.
const NO_COHORT = '(no cohort)';
const NO_DEPARTMENT = '(unspecified)';

// --- Pure helpers ----------------------------------------------------------

// A ratio in [0,1], rounded to 4 dp. Zero denominator → 0 (no false precision).
function rate(numerator, denominator) {
  if (!denominator || denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 10000) / 10000;
}

// Mutually-exclusive susceptibility tier for one interaction, by priority.
function classifyTier({ opened, clicked, submitted }) {
  if (submitted) return 'clicked_submitted';
  if (clicked) return 'clicked_only';
  if (opened) return 'opened_only';
  return 'no_action';
}

function emptyTiers() {
  return { no_action: 0, opened_only: 0, clicked_only: 0, clicked_submitted: 0 };
}

// Aggregate a set of interaction-flag rows into counts + rates + the four-tier
// breakdown. Consumes only flags; emits only numbers.
function summarizeFlags(rows) {
  const tiers = emptyTiers();
  let opened = 0;
  let clicked = 0;
  let submitted = 0;
  for (const r of rows) {
    if (r.opened) opened += 1;
    if (r.clicked) clicked += 1;
    if (r.submitted) submitted += 1;
    tiers[classifyTier(r)] += 1;
  }
  const total = rows.length;
  return {
    total,
    opened,
    clicked,
    submitted,
    open_rate: rate(opened, total),
    click_rate: rate(clicked, total),
    submission_rate: rate(submitted, total),
    tiers,
  };
}

// Aggregate training-assignment rows into completion counts + rate.
function summarizeAssignments(rows) {
  let assigned = 0;
  let in_progress = 0;
  let completed = 0;
  for (const r of rows) {
    if (r.status === 'completed') completed += 1;
    else if (r.status === 'in_progress') in_progress += 1;
    else assigned += 1;
  }
  const total = rows.length;
  return {
    total,
    assigned,
    in_progress,
    completed,
    completion_rate: rate(completed, total),
  };
}

function groupKey(row, groupBy) {
  if (groupBy === 'department') return row.department || NO_DEPARTMENT;
  return row.cohort || NO_COHORT;
}

// Partition rows by group dimension, preserving insertion order of first sight.
function partition(rows, groupBy) {
  const buckets = new Map();
  for (const r of rows) {
    const key = groupKey(r, groupBy);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(r);
  }
  return buckets;
}

// Build the per-group breakdown with small-group suppression applied. Any group
// below `minGroupSize` is withheld and folded into the `suppressed` summary —
// its counts are never emitted. Reported groups are sorted by key for stable
// output. `summarize` produces the aggregate object for a group's rows.
function buildGroups(rows, groupBy, minGroupSize, summarize) {
  const buckets = partition(rows, groupBy);
  const groups = [];
  const suppressed = { groups: 0, participants: 0 };

  for (const [key, groupRows] of buckets) {
    if (groupRows.length < minGroupSize) {
      suppressed.groups += 1;
      suppressed.participants += groupRows.length;
      continue;
    }
    groups.push({ key, ...summarize(groupRows) });
  }

  groups.sort((a, b) => String(a.key).localeCompare(String(b.key)));
  return { groups, suppressed };
}

// Wrap a whole-population summary with total-suppression: if the population is
// below the threshold, totals are withheld (only the bare population size — an
// outcome-free count — is exposed).
function overallBlock(rows, minGroupSize, summarize) {
  const total = rows.length;
  const suppressed = total > 0 && total < minGroupSize;
  return {
    total_participants: total,
    totals_suppressed: suppressed,
    totals: suppressed ? null : summarize(rows),
  };
}

function campaignMeta(campaign) {
  return {
    id: campaign.id,
    name: campaign.name,
    phase_label: campaign.phase_label || null,
    status: campaign.status,
  };
}

// --- Orchestration ---------------------------------------------------------

function resolveGroupBy(groupBy) {
  const g = groupBy || 'cohort';
  if (!GROUP_BYS.includes(g)) throw badRequest('invalid_group_by');
  return g;
}

async function loadCampaign(campaignId, repos) {
  const campaign = await repos.campaigns.findById(campaignId);
  if (!campaign) throw notFound('campaign_not_found');
  return campaign;
}

// Full aggregate report for one campaign: interaction four-tier breakdown
// (grouped by cohort or department, with click/submission/open rates) plus the
// training-completion rollup. Aggregate-only; small groups suppressed.
async function campaignAnalytics({
  campaignId,
  groupBy,
  minGroupSize = config.analyticsMinGroupSize,
  repos = repositories,
} = {}) {
  const g = resolveGroupBy(groupBy);
  const campaign = await loadCampaign(campaignId, repos);

  const flagRows = await repos.analytics.interactionFlagsByCampaign(campaignId);
  const assignmentRows = await repos.analytics.assignmentStatusByCampaign(campaignId);

  const interactionsOverall = overallBlock(flagRows, minGroupSize, summarizeFlags);
  const interactionGroups = buildGroups(flagRows, g, minGroupSize, summarizeFlags);
  const trainingOverall = overallBlock(assignmentRows, minGroupSize, summarizeAssignments);
  const trainingGroups = buildGroups(assignmentRows, g, minGroupSize, summarizeAssignments);

  return {
    campaign: campaignMeta(campaign),
    group_by: g,
    min_group_size: minGroupSize,
    interactions: {
      ...interactionsOverall,
      groups: interactionGroups.groups,
      suppressed: interactionGroups.suppressed,
    },
    training: {
      ...trainingOverall,
      groups: trainingGroups.groups,
      suppressed: trainingGroups.suppressed,
    },
  };
}

// Phase-over-phase comparison: whole-campaign aggregate metrics for several
// campaigns side by side, plus rate deltas of each subsequent campaign against
// the first (the baseline phase). Every per-campaign block is itself
// total-suppressed when the campaign is below threshold; a delta is only
// computed when BOTH sides are reported (never inferred from a suppressed side).
async function comparison({
  campaignIds,
  minGroupSize = config.analyticsMinGroupSize,
  repos = repositories,
} = {}) {
  if (!Array.isArray(campaignIds) || campaignIds.length === 0) {
    throw badRequest('campaign_ids_required');
  }

  const blocks = [];
  for (const id of campaignIds) {
    const campaign = await loadCampaign(id, repos);
    const flagRows = await repos.analytics.interactionFlagsByCampaign(id);
    const overall = overallBlock(flagRows, minGroupSize, summarizeFlags);
    blocks.push({
      campaign: campaignMeta(campaign),
      total_participants: overall.total_participants,
      suppressed: overall.totals_suppressed,
      metrics: overall.totals
        ? {
            open_rate: overall.totals.open_rate,
            click_rate: overall.totals.click_rate,
            submission_rate: overall.totals.submission_rate,
            tiers: overall.totals.tiers,
          }
        : null,
    });
  }

  const baseline = blocks[0];
  const deltas = [];
  if (baseline && baseline.metrics) {
    for (const block of blocks.slice(1)) {
      if (!block.metrics) continue; // a suppressed side yields no delta
      deltas.push({
        campaign_id: block.campaign.id,
        open_rate_delta:
          Math.round((block.metrics.open_rate - baseline.metrics.open_rate) * 10000) / 10000,
        click_rate_delta:
          Math.round((block.metrics.click_rate - baseline.metrics.click_rate) * 10000) / 10000,
        submission_rate_delta:
          Math.round(
            (block.metrics.submission_rate - baseline.metrics.submission_rate) * 10000
          ) / 10000,
      });
    }
  }

  return {
    min_group_size: minGroupSize,
    baseline_campaign_id: baseline ? baseline.campaign.id : null,
    campaigns: blocks,
    deltas,
  };
}

// Anonymized, tabular export of the four-tier breakdown per group (the core
// research payoff). Only reported (non-suppressed) groups become rows — a
// suppressed small group is never written out — and no identifier appears in any
// column. Returns { columns, rows, suppressed } for CSV/JSON serialization.
async function anonymizedExport({
  campaignId,
  groupBy,
  minGroupSize = config.analyticsMinGroupSize,
  repos = repositories,
} = {}) {
  const report = await campaignAnalytics({ campaignId, groupBy, minGroupSize, repos });
  const columns = [
    'group',
    'total',
    'opened',
    'clicked',
    'submitted',
    'open_rate',
    'click_rate',
    'submission_rate',
    'no_action',
    'opened_only',
    'clicked_only',
    'clicked_submitted',
  ];
  const rows = report.interactions.groups.map((gp) => ({
    group: gp.key,
    total: gp.total,
    opened: gp.opened,
    clicked: gp.clicked,
    submitted: gp.submitted,
    open_rate: gp.open_rate,
    click_rate: gp.click_rate,
    submission_rate: gp.submission_rate,
    no_action: gp.tiers.no_action,
    opened_only: gp.tiers.opened_only,
    clicked_only: gp.tiers.clicked_only,
    clicked_submitted: gp.tiers.clicked_submitted,
  }));
  return {
    campaign: report.campaign,
    group_by: report.group_by,
    min_group_size: report.min_group_size,
    columns,
    rows,
    suppressed: report.interactions.suppressed,
  };
}

// Minimal, dependency-free CSV serializer with RFC-4180 quoting. Consumes the
// { columns, rows } shape from `anonymizedExport` (aggregate rows only).
function csvCell(value) {
  const s = value === null || value === undefined ? '' : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv({ columns, rows }) {
  const header = columns.map(csvCell).join(',');
  const body = rows.map((row) => columns.map((c) => csvCell(row[c])).join(','));
  return [header, ...body].join('\n');
}

module.exports = {
  // orchestration
  campaignAnalytics,
  comparison,
  anonymizedExport,
  toCsv,
  // pure helpers (exported for unit tests)
  rate,
  classifyTier,
  summarizeFlags,
  summarizeAssignments,
  buildGroups,
  GROUP_BYS,
};
