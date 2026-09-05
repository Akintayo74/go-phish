import React, { useCallback, useEffect, useState } from 'react';
import { api } from './api.js';
import { color } from '../ui/theme.js';

// Phase comparison panel (Phase 10) — the core research payoff. For one
// campaign it loads the whole re-test family (the original phase plus every
// clone descended from it) and lays the phases out side by side: each phase's
// aggregate open/click/submission rates, and the change in click/submission
// rate against the first (baseline) phase. A falling submission rate across
// phases is the training loop working.
//
// Everything here is aggregate-only and inherits the backend's k-anonymity
// suppression (guardrail #5): a phase with too few targets is shown as
// "suppressed" and contributes no delta, rather than exposing an individual.

function pct(ratio) {
  return `${Math.round((ratio || 0) * 1000) / 10}%`;
}

// A signed percentage-point delta. Positive gets an explicit '+'; negative
// already carries its '-'. A change of exactly zero reads as '0pp'.
function deltaLabel(ratio) {
  const pp = Math.round((ratio || 0) * 1000) / 10;
  const sign = pp > 0 ? '+' : '';
  return `${sign}${pp}pp`;
}

// Down is good for susceptibility metrics; classify for callers that want to
// style the direction (and to give the test a stable hook).
function direction(ratio) {
  if (!ratio) return 'flat';
  return ratio < 0 ? 'down' : 'up';
}

function PhaseRow({ block, isBaseline, delta }) {
  const label = block.campaign.phase_label || block.campaign.name;

  if (block.suppressed || !block.metrics) {
    return (
      <tr data-testid="phase-row">
        <th scope="row">
          {label} {isBaseline && <span data-testid="baseline-badge">(baseline)</span>}
        </th>
        <td>{block.total_participants}</td>
        <td colSpan={5} data-testid="phase-suppressed">
          Too few targets to report
        </td>
      </tr>
    );
  }

  const m = block.metrics;
  return (
    <tr data-testid="phase-row">
      <th scope="row">
        {label} {isBaseline && <span data-testid="baseline-badge">(baseline)</span>}
      </th>
      <td>{block.total_participants}</td>
      <td>{pct(m.open_rate)}</td>
      <td data-testid="click-rate">{pct(m.click_rate)}</td>
      <td data-testid="submission-rate">{pct(m.submission_rate)}</td>
      {isBaseline ? (
        <>
          <td>—</td>
          <td>—</td>
        </>
      ) : (
        <>
          <td data-testid="click-delta" data-direction={delta ? direction(delta.click_rate_delta) : 'flat'}>
            {delta ? deltaLabel(delta.click_rate_delta) : '—'}
          </td>
          <td
            data-testid="submission-delta"
            data-direction={delta ? direction(delta.submission_rate_delta) : 'flat'}
          >
            {delta ? deltaLabel(delta.submission_rate_delta) : '—'}
          </td>
        </>
      )}
    </tr>
  );
}

export default function PhaseComparison({ campaignId }) {
  const [comparison, setComparison] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: phases } = await api.campaignPhases(campaignId);
      const ids = (phases || []).map((p) => p.id);
      if (ids.length === 0) {
        setComparison({ campaigns: [], deltas: [], baseline_campaign_id: null });
        return;
      }
      const { data } = await api.compareCampaigns(ids);
      setComparison(data);
    } catch (_e) {
      setError('Could not load phase comparison.');
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <p>Loading phase comparison…</p>;
  if (error) return <p role="alert">{error}</p>;
  if (!comparison) return null;

  const blocks = comparison.campaigns || [];
  const baselineId = comparison.baseline_campaign_id;
  const deltaById = new Map((comparison.deltas || []).map((d) => [d.campaign_id, d]));

  return (
    <section aria-label="phase comparison" data-testid="phase-comparison" className="cs-panel">
      {blocks.length < 2 && (
        <p data-testid="single-phase-note" role="note" style={{ margin: 0, color: color.textSecondary, fontSize: 13, lineHeight: 1.5 }}>
          This campaign has no other phases yet. Clone it as a new phase to run a re-test, then
          return here to compare susceptibility across phases.
        </p>
      )}

      {blocks.length > 0 && (
        <div className="cs-table-wrap">
        <table className="cs-table">
          <thead>
            <tr>
              <th>Phase</th>
              <th>Targets</th>
              <th>Open</th>
              <th>Click</th>
              <th>Submit</th>
              <th>Δ Click</th>
              <th>Δ Submit</th>
            </tr>
          </thead>
          <tbody>
            {blocks.map((block) => (
              <PhaseRow
                key={block.campaign.id}
                block={block}
                isBaseline={block.campaign.id === baselineId}
                delta={deltaById.get(block.campaign.id)}
              />
            ))}
          </tbody>
        </table>
        </div>
      )}
    </section>
  );
}
