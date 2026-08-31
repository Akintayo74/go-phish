'use strict';

// Analytics service unit tests (Phase 9) — DB-free. Cover the pure aggregation
// math (tiers, rates, grouping, suppression), the campaign report shape, the
// phase-over-phase comparison + deltas, the anonymized export, and the CSV
// serializer. The aggregate-only + suppression guardrails are pinned separately
// in tests/analytics.guardrail.test.js.

const analytics = require('../src/services/analytics');
const {
  rate,
  classifyTier,
  summarizeFlags,
  summarizeAssignments,
  buildGroups,
} = analytics;

describe('rate()', () => {
  test('is a 4dp ratio; zero denominator is 0 (no false precision)', () => {
    expect(rate(1, 2)).toBe(0.5);
    expect(rate(1, 3)).toBe(0.3333);
    expect(rate(0, 0)).toBe(0);
    expect(rate(5, 0)).toBe(0);
    expect(rate(2, 2)).toBe(1);
  });
});

describe('classifyTier()', () => {
  test('mutually exclusive, by priority submitted > clicked > opened > none', () => {
    expect(classifyTier({ opened: false, clicked: false, submitted: false })).toBe('no_action');
    expect(classifyTier({ opened: true, clicked: false, submitted: false })).toBe('opened_only');
    expect(classifyTier({ opened: true, clicked: true, submitted: false })).toBe('clicked_only');
    expect(classifyTier({ opened: true, clicked: true, submitted: true })).toBe('clicked_submitted');
    // Robust even if flags are not strictly monotonic (submit without click).
    expect(classifyTier({ opened: false, clicked: false, submitted: true })).toBe('clicked_submitted');
  });
});

describe('summarizeFlags()', () => {
  test('counts, rates, and a partitioning four-tier breakdown', () => {
    const rows = [
      { opened: true, clicked: true, submitted: true },
      { opened: true, clicked: true, submitted: false },
      { opened: true, clicked: false, submitted: false },
      { opened: false, clicked: false, submitted: false },
    ];
    const s = summarizeFlags(rows);
    expect(s.total).toBe(4);
    expect(s.opened).toBe(3);
    expect(s.clicked).toBe(2);
    expect(s.submitted).toBe(1);
    expect(s.open_rate).toBe(0.75);
    expect(s.click_rate).toBe(0.5);
    expect(s.submission_rate).toBe(0.25);
    expect(s.tiers).toEqual({ no_action: 1, opened_only: 1, clicked_only: 1, clicked_submitted: 1 });
    const sum = Object.values(s.tiers).reduce((a, b) => a + b, 0);
    expect(sum).toBe(s.total);
  });

  test('an empty set is all-zero, no NaN rates', () => {
    const s = summarizeFlags([]);
    expect(s).toEqual({
      total: 0,
      opened: 0,
      clicked: 0,
      submitted: 0,
      open_rate: 0,
      click_rate: 0,
      submission_rate: 0,
      tiers: { no_action: 0, opened_only: 0, clicked_only: 0, clicked_submitted: 0 },
    });
  });
});

describe('summarizeAssignments()', () => {
  test('completion rollup + rate', () => {
    const rows = [
      { status: 'completed' },
      { status: 'completed' },
      { status: 'in_progress' },
      { status: 'assigned' },
    ];
    const s = summarizeAssignments(rows);
    expect(s).toEqual({
      total: 4,
      assigned: 1,
      in_progress: 1,
      completed: 2,
      completion_rate: 0.5,
    });
  });
});

describe('buildGroups()', () => {
  const rows = [
    { cohort: 'Big', department: 'D1', opened: true, clicked: true, submitted: false },
    { cohort: 'Big', department: 'D1', opened: true, clicked: false, submitted: false },
    { cohort: 'Big', department: 'D2', opened: false, clicked: false, submitted: false },
    { cohort: 'Small', department: 'D2', opened: true, clicked: true, submitted: true },
  ];

  test('groups by cohort; below-threshold groups are suppressed, output sorted', () => {
    const { groups, suppressed } = buildGroups(rows, 'cohort', 3, summarizeFlags);
    expect(groups.map((g) => g.key)).toEqual(['Big']); // Small (1) suppressed
    expect(groups[0].total).toBe(3);
    expect(suppressed).toEqual({ groups: 1, participants: 1 });
  });

  test('groups by department instead when asked', () => {
    const { groups, suppressed } = buildGroups(rows, 'department', 2, summarizeFlags);
    // D1 has 2 (reported), D2 has 2 (reported).
    expect(groups.map((g) => g.key)).toEqual(['D1', 'D2']);
    expect(suppressed).toEqual({ groups: 0, participants: 0 });
  });

  test('missing department falls back to a stable label', () => {
    const withNull = [
      { department: null, opened: true, clicked: false, submitted: false },
      { department: null, opened: false, clicked: false, submitted: false },
    ];
    const { groups } = buildGroups(withNull, 'department', 2, summarizeFlags);
    expect(groups.map((g) => g.key)).toEqual(['(unspecified)']);
  });
});

// --- Orchestration ---------------------------------------------------------

const CAMPAIGN = { id: 'c1', name: 'Camp', phase_label: 'Phase I', status: 'active' };

function repos({ campaign = CAMPAIGN, flags = [], assignments = [], byId } = {}) {
  return {
    campaigns: { findById: async (id) => (byId ? byId(id) : campaign) },
    analytics: {
      interactionFlagsByCampaign: async () => flags,
      assignmentStatusByCampaign: async () => assignments,
    },
  };
}

function nFlags(n, f) {
  return Array.from({ length: n }, () => ({ cohort: 'Retail', department: 'R', ...f }));
}

describe('campaignAnalytics()', () => {
  test('404s an unknown campaign', async () => {
    await expect(
      analytics.campaignAnalytics({ campaignId: 'nope', repos: repos({ byId: () => undefined }) })
    ).rejects.toMatchObject({ status: 404, publicMessage: 'campaign_not_found' });
  });

  test('rejects an invalid group_by before touching data', async () => {
    await expect(
      analytics.campaignAnalytics({ campaignId: 'c1', groupBy: 'role', repos: repos() })
    ).rejects.toMatchObject({ status: 400, publicMessage: 'invalid_group_by' });
  });

  test('returns campaign meta, grouped interactions, and a training rollup', async () => {
    const flags = [
      ...nFlags(3, { opened: true, clicked: true, submitted: true }),
      ...nFlags(2, { opened: true, clicked: false, submitted: false }),
    ];
    const assignments = [
      { cohort: 'Retail', department: 'R', status: 'completed' },
      { cohort: 'Retail', department: 'R', status: 'completed' },
      { cohort: 'Retail', department: 'R', status: 'assigned' },
    ];
    const report = await analytics.campaignAnalytics({
      campaignId: 'c1',
      groupBy: 'cohort',
      minGroupSize: 3,
      repos: repos({ flags, assignments }),
    });

    expect(report.campaign).toEqual({ id: 'c1', name: 'Camp', phase_label: 'Phase I', status: 'active' });
    expect(report.group_by).toBe('cohort');
    expect(report.min_group_size).toBe(3);

    expect(report.interactions.total_participants).toBe(5);
    expect(report.interactions.totals.click_rate).toBe(0.6);
    expect(report.interactions.groups).toHaveLength(1);
    expect(report.interactions.groups[0].key).toBe('Retail');

    expect(report.training.total_participants).toBe(3);
    expect(report.training.totals.completed).toBe(2);
    expect(report.training.totals.completion_rate).toBe(0.6667);
  });
});

describe('comparison()', () => {
  test('side-by-side metrics + deltas vs the baseline campaign', async () => {
    const p1 = { id: 'p1', name: 'Phase I', phase_label: 'Phase I', status: 'completed' };
    const p2 = { id: 'p2', name: 'Phase II', phase_label: 'Phase II', status: 'active' };
    const flagsById = {
      p1: nFlags(10, { opened: true, clicked: true, submitted: true }), // 100% submit
      p2: [
        ...nFlags(2, { opened: true, clicked: true, submitted: true }),
        ...nFlags(8, { opened: true, clicked: false, submitted: false }),
      ], // 20% submit
    };
    const r = {
      campaigns: { findById: async (id) => (id === 'p1' ? p1 : p2) },
      analytics: {
        interactionFlagsByCampaign: async (id) => flagsById[id],
        assignmentStatusByCampaign: async () => [],
      },
    };

    const cmp = await analytics.comparison({ campaignIds: ['p1', 'p2'], minGroupSize: 3, repos: r });
    expect(cmp.baseline_campaign_id).toBe('p1');
    expect(cmp.campaigns).toHaveLength(2);
    expect(cmp.campaigns[0].metrics.submission_rate).toBe(1);
    expect(cmp.campaigns[1].metrics.submission_rate).toBe(0.2);
    expect(cmp.deltas).toEqual([
      { campaign_id: 'p2', open_rate_delta: 0, click_rate_delta: -0.8, submission_rate_delta: -0.8 },
    ]);
  });

  test('a suppressed side yields no delta and is marked suppressed', async () => {
    const p1 = { id: 'p1', name: 'A', phase_label: null, status: 'active' };
    const p2 = { id: 'p2', name: 'B', phase_label: null, status: 'active' };
    const r = {
      campaigns: { findById: async (id) => (id === 'p1' ? p1 : p2) },
      analytics: {
        interactionFlagsByCampaign: async (id) =>
          id === 'p1'
            ? nFlags(5, { opened: true, clicked: false, submitted: false })
            : nFlags(1, { opened: true, clicked: true, submitted: true }), // below threshold
        assignmentStatusByCampaign: async () => [],
      },
    };
    const cmp = await analytics.comparison({ campaignIds: ['p1', 'p2'], minGroupSize: 3, repos: r });
    expect(cmp.campaigns[1].suppressed).toBe(true);
    expect(cmp.campaigns[1].metrics).toBeNull();
    expect(cmp.deltas).toEqual([]); // no delta computed against a suppressed side
  });

  test('requires at least one campaign id', async () => {
    await expect(analytics.comparison({ campaignIds: [], repos: repos() })).rejects.toMatchObject({
      status: 400,
      publicMessage: 'campaign_ids_required',
    });
  });
});

describe('anonymizedExport() + toCsv()', () => {
  test('emits one aggregate row per reported group; suppressed groups excluded', async () => {
    const flags = [
      ...nFlags(4, { opened: true, clicked: true, submitted: true }),
      { cohort: 'Solo', department: 'S', opened: true, clicked: true, submitted: true },
    ];
    const table = await analytics.anonymizedExport({
      campaignId: 'c1',
      groupBy: 'cohort',
      minGroupSize: 3,
      repos: repos({ flags }),
    });
    expect(table.columns[0]).toBe('group');
    expect(table.rows).toHaveLength(1); // Solo suppressed
    expect(table.rows[0]).toMatchObject({ group: 'Retail', total: 4, clicked_submitted: 4 });
    expect(table.suppressed).toEqual({ groups: 1, participants: 1 });

    const csv = analytics.toCsv(table);
    const lines = csv.split('\n');
    expect(lines[0]).toBe(table.columns.join(','));
    expect(lines).toHaveLength(2); // header + one group row
    expect(lines[1].startsWith('Retail,4,')).toBe(true);
  });

  test('toCsv quotes fields containing commas, quotes, or newlines', () => {
    const csv = analytics.toCsv({
      columns: ['group', 'total'],
      rows: [{ group: 'Sales, EMEA', total: 3 }, { group: 'A "B"', total: 1 }],
    });
    expect(csv).toContain('"Sales, EMEA",3');
    expect(csv).toContain('"A ""B""",1');
  });
});
