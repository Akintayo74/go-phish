'use strict';

// ============================================================================
// NAMED GUARDRAIL TEST — Phase 9 analytics dashboard.
// Do not weaken or delete.
// ============================================================================
//
// The analytics dashboard is the one management/researcher-facing surface over
// the raw behavioral data, so it is where guardrail #5 (aggregate-only, NEVER a
// per-individual result) is most at risk. This test pins the two invariants that
// keep it safe:
//
//  1. AGGREGATE-ONLY: no identifier ever reaches the output. Even when the rows
//     the service consumes carry a participant id / contact hash / raw address,
//     the emitted report contains none of them — only group-level counts + rates.
//
//  2. SMALL-GROUP SUPPRESSION (k-anonymity): a cohort/department group smaller
//     than `minGroupSize` is NEVER reported with its own counts. A group of one
//     would otherwise turn an "aggregate" into that single person's result. Such
//     groups collapse into a suppressed summary that exposes only how many groups
//     and participants were withheld (a bare count, no outcome). The whole-
//     campaign total is itself suppressed when the campaign is below threshold.

const analytics = require('../src/services/analytics');

const CAMPAIGN = { id: 'camp-1', name: 'Baseline — Phase I', phase_label: 'Phase I', status: 'active' };

// Identifiers that, if any leaked into the report, this test finds.
const PID = 'PARTICIPANT-ID-SHOULD-NEVER-APPEAR';
const HASH = 'CONTACT-HASH-SHOULD-NEVER-APPEAR';
const RAW = 'victim@secret.test';

// A reported cohort (>= threshold) with a deterministic flag mix, plus a
// one-person "Solo" cohort whose lone member submitted — it must be suppressed.
function flagRows() {
  const retail = [
    { opened: true, clicked: true, submitted: true },
    { opened: true, clicked: true, submitted: true },
    { opened: true, clicked: true, submitted: false },
    { opened: true, clicked: false, submitted: false },
    { opened: false, clicked: false, submitted: false },
  ].map((f, i) => ({
    cohort: 'Retail Banking',
    department: 'Retail',
    ...f,
    // Deliberately smuggle identifiers into the rows the service consumes.
    participant_id: `${PID}-${i}`,
    email_or_phone_hash: `${HASH}-${i}`,
    raw_email: RAW,
  }));
  const solo = [
    {
      cohort: 'Solo Cohort',
      department: 'Executive',
      opened: true,
      clicked: true,
      submitted: true,
      participant_id: `${PID}-solo`,
      email_or_phone_hash: `${HASH}-solo`,
      raw_email: RAW,
    },
  ];
  return [...retail, ...solo];
}

function reposWith(flags, assignments = []) {
  return {
    campaigns: { findById: async () => CAMPAIGN },
    analytics: {
      interactionFlagsByCampaign: async () => flags,
      assignmentStatusByCampaign: async () => assignments,
    },
  };
}

describe('Phase 9 guardrail — analytics output is aggregate-only', () => {
  test('no participant id, contact hash, or raw address appears anywhere in the report', async () => {
    const report = await analytics.campaignAnalytics({
      campaignId: 'camp-1',
      groupBy: 'cohort',
      minGroupSize: 3,
      repos: reposWith(flagRows()),
    });

    const flat = JSON.stringify(report);
    expect(flat).not.toContain(PID);
    expect(flat).not.toContain(HASH);
    expect(flat).not.toContain(RAW);
  });
});

describe('Phase 9 guardrail — small groups are suppressed', () => {
  test('a single-person cohort is never reported; only a suppressed count remains', async () => {
    const report = await analytics.campaignAnalytics({
      campaignId: 'camp-1',
      groupBy: 'cohort',
      minGroupSize: 3,
      repos: reposWith(flagRows()),
    });

    const keys = report.interactions.groups.map((g) => g.key);
    // The reported group is present…
    expect(keys).toContain('Retail Banking');
    // …the lone-member cohort is NOT reported with its own counts…
    expect(keys).not.toContain('Solo Cohort');
    // …it survives only as an outcome-free suppressed summary.
    expect(report.interactions.suppressed).toEqual({ groups: 1, participants: 1 });
    // The suppressed summary carries no tier/outcome fields — just the counts.
    expect(Object.keys(report.interactions.suppressed).sort()).toEqual(['groups', 'participants']);
    // And the suppressed member's outcome is not smuggled into the totals view
    // as a standalone reveal: totals aggregate the WHOLE campaign (6 people).
    expect(report.interactions.total_participants).toBe(6);
    expect(report.interactions.totals.total).toBe(6);
  });

  test('reported group counts + rates are correct aggregates', async () => {
    const report = await analytics.campaignAnalytics({
      campaignId: 'camp-1',
      groupBy: 'cohort',
      minGroupSize: 3,
      repos: reposWith(flagRows()),
    });
    const retail = report.interactions.groups.find((g) => g.key === 'Retail Banking');
    expect(retail.total).toBe(5);
    expect(retail.opened).toBe(4);
    expect(retail.clicked).toBe(3);
    expect(retail.submitted).toBe(2);
    expect(retail.open_rate).toBe(0.8);
    expect(retail.click_rate).toBe(0.6);
    expect(retail.submission_rate).toBe(0.4);
    expect(retail.tiers).toEqual({
      no_action: 1,
      opened_only: 1,
      clicked_only: 1,
      clicked_submitted: 2,
    });
    // The four tiers partition the group exactly.
    const tierSum = Object.values(retail.tiers).reduce((a, b) => a + b, 0);
    expect(tierSum).toBe(retail.total);
  });

  test('a below-threshold campaign has its totals suppressed too', async () => {
    // Only two targets in total (< minGroupSize) — nothing may be reported.
    const rows = [
      { cohort: 'A', department: 'X', opened: true, clicked: true, submitted: true },
      { cohort: 'B', department: 'Y', opened: false, clicked: false, submitted: false },
    ];
    const report = await analytics.campaignAnalytics({
      campaignId: 'camp-1',
      groupBy: 'cohort',
      minGroupSize: 3,
      repos: reposWith(rows),
    });
    expect(report.interactions.total_participants).toBe(2); // population size only
    expect(report.interactions.totals_suppressed).toBe(true);
    expect(report.interactions.totals).toBeNull();
    expect(report.interactions.groups).toEqual([]);
    expect(report.interactions.suppressed).toEqual({ groups: 2, participants: 2 });
  });
});
