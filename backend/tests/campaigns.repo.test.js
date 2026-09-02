'use strict';

// Phase 10 — re-test support. Unit tests for the pure clone/lineage helpers in
// the campaigns repository. These carry the invariants that make a "re-test" a
// clean new phase rather than a copy of old data:
//
//   * cloneAttrs copies only the campaign DEFINITION — never `status` (a clone
//     is born 'draft' via the schema default) and never `scheduled_send_at` (a
//     re-test is scheduled fresh). It always stamps the lineage link.
//   * buildLineage reconstructs a whole phase family from any member and orders
//     it oldest-first, so Phase I / Phase II / … line up for comparison.

const { cloneAttrs, buildLineage } = require('../src/repositories/campaigns');

describe('cloneAttrs', () => {
  const source = {
    id: 'src-1',
    name: 'Baseline — Phase I',
    description: 'Initial measurement.',
    phase_label: 'Phase I',
    enrollment_trigger: 'submitted',
    status: 'completed',
    scheduled_send_at: '2026-01-01T00:00:00Z',
  };

  test('inherits the definition when no overrides are given', () => {
    expect(cloneAttrs(source)).toEqual({
      name: 'Baseline — Phase I',
      description: 'Initial measurement.',
      phase_label: 'Phase I',
      enrollment_trigger: 'submitted',
      cloned_from_campaign_id: 'src-1',
    });
  });

  test('never copies status or scheduled_send_at (clone is born fresh)', () => {
    const attrs = cloneAttrs(source);
    expect(attrs).not.toHaveProperty('status');
    expect(attrs).not.toHaveProperty('scheduled_send_at');
    expect(attrs).not.toHaveProperty('id');
  });

  test('always stamps the lineage link back to the source', () => {
    expect(cloneAttrs(source).cloned_from_campaign_id).toBe('src-1');
  });

  test('applies overrides over the inherited values', () => {
    const attrs = cloneAttrs(source, {
      name: 'Baseline — Phase II',
      phase_label: 'Phase II',
      enrollment_trigger: 'clicked',
    });
    expect(attrs.name).toBe('Baseline — Phase II');
    expect(attrs.phase_label).toBe('Phase II');
    expect(attrs.enrollment_trigger).toBe('clicked');
    expect(attrs.description).toBe('Initial measurement.'); // untouched → inherited
    expect(attrs.cloned_from_campaign_id).toBe('src-1');
  });

  test('a null override clears the field rather than inheriting', () => {
    expect(cloneAttrs(source, { description: null }).description).toBeNull();
  });

  test('falls back to null for a missing source field', () => {
    expect(cloneAttrs({ id: 'x' }).phase_label).toBeNull();
  });
});

describe('buildLineage', () => {
  // A three-phase family plus an unrelated campaign that must never leak in.
  const rows = [
    { id: 'p1', phase_label: 'Phase I', cloned_from_campaign_id: null, created_at: '2026-01-01' },
    { id: 'p2', phase_label: 'Phase II', cloned_from_campaign_id: 'p1', created_at: '2026-02-01' },
    { id: 'p3', phase_label: 'Phase III', cloned_from_campaign_id: 'p2', created_at: '2026-03-01' },
    { id: 'other', phase_label: 'Phase I', cloned_from_campaign_id: null, created_at: '2026-01-15' },
  ];

  test('returns the whole family, oldest-first, from the root', () => {
    expect(buildLineage(rows, 'p1').map((r) => r.id)).toEqual(['p1', 'p2', 'p3']);
  });

  test('returns the whole family from a middle member', () => {
    expect(buildLineage(rows, 'p2').map((r) => r.id)).toEqual(['p1', 'p2', 'p3']);
  });

  test('returns the whole family from the newest member', () => {
    expect(buildLineage(rows, 'p3').map((r) => r.id)).toEqual(['p1', 'p2', 'p3']);
  });

  test('never mixes in an unrelated campaign', () => {
    expect(buildLineage(rows, 'p1').map((r) => r.id)).not.toContain('other');
  });

  test('a never-cloned campaign returns just itself', () => {
    expect(buildLineage(rows, 'other').map((r) => r.id)).toEqual(['other']);
  });

  test('an unknown id returns an empty family', () => {
    expect(buildLineage(rows, 'missing')).toEqual([]);
  });

  test('orders siblings by created_at then id', () => {
    const branched = [
      { id: 'root', cloned_from_campaign_id: null, created_at: '2026-01-01' },
      { id: 'b', cloned_from_campaign_id: 'root', created_at: '2026-03-01' },
      { id: 'a', cloned_from_campaign_id: 'root', created_at: '2026-02-01' },
    ];
    expect(buildLineage(branched, 'root').map((r) => r.id)).toEqual(['root', 'a', 'b']);
  });

  test('tolerates a lineage cycle without looping forever', () => {
    // A hand-edited cycle (the clone path cannot create one). Must terminate.
    const cyclic = [
      { id: 'x', cloned_from_campaign_id: 'y', created_at: '2026-01-01' },
      { id: 'y', cloned_from_campaign_id: 'x', created_at: '2026-01-02' },
    ];
    const ids = buildLineage(cyclic, 'x').map((r) => r.id).sort();
    expect(ids).toEqual(['x', 'y']);
  });
});
