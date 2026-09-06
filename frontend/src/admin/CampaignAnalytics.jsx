import React, { useCallback, useEffect, useState } from 'react';
import { api, fetchAnalyticsExport } from './api.js';
import { color } from '../ui/theme.js';
import { Button } from '../ui/primitives.jsx';

// Campaign analytics panel (Phase 9). Renders the AGGREGATE-ONLY report for one
// campaign: overall click/submission/open rates, the four-tier susceptibility
// breakdown grouped by cohort or department, and the training-completion
// rollup. Everything shown here is a group aggregate — the backend suppresses
// any group below its k-anonymity threshold (guardrail #5), and this view
// surfaces that suppression rather than hiding it. There is no per-individual
// data to render.

const GROUP_BYS = [
  ['cohort', 'Cohort'],
  ['department', 'Department'],
];

const TIER_LABELS = [
  ['no_action', 'No action'],
  ['opened_only', 'Opened only'],
  ['clicked_only', 'Clicked only'],
  ['clicked_submitted', 'Clicked + submitted'],
];

function pct(ratio) {
  return `${Math.round((ratio || 0) * 1000) / 10}%`;
}

function SuppressionNote({ suppressed }) {
  if (!suppressed || suppressed.groups === 0) return null;
  return (
    <p data-testid="suppression-note" role="note">
      {suppressed.groups} group{suppressed.groups === 1 ? '' : 's'} (
      {suppressed.participants} participant{suppressed.participants === 1 ? '' : 's'}) hidden to
      protect individual privacy — groups too small to report are withheld.
    </p>
  );
}

function InteractionTable({ interactions }) {
  if (interactions.totals_suppressed) {
    return (
      <p data-testid="totals-suppressed">
        Too few targets ({interactions.total_participants}) to report without risking individual
        identification.
      </p>
    );
  }
  return (
    <>
      <dl data-testid="overall-rates" className="cs-dl">
        <div>
          <dt>Open rate</dt>
          <dd>{pct(interactions.totals.open_rate)}</dd>
        </div>
        <div>
          <dt>Click rate</dt>
          <dd data-testid="click-rate">{pct(interactions.totals.click_rate)}</dd>
        </div>
        <div>
          <dt>Submission rate</dt>
          <dd data-testid="submission-rate">{pct(interactions.totals.submission_rate)}</dd>
        </div>
        <div>
          <dt>Targets</dt>
          <dd>{interactions.total_participants}</dd>
        </div>
      </dl>

      {interactions.groups.length > 0 ? (
        <div className="cs-table-wrap">
        <table data-testid="tier-breakdown" className="cs-table">
          <thead>
            <tr>
              <th>Group</th>
              <th>Targets</th>
              {TIER_LABELS.map(([key, label]) => (
                <th key={key}>{label}</th>
              ))}
              <th>Click</th>
              <th>Submit</th>
            </tr>
          </thead>
          <tbody>
            {interactions.groups.map((g) => (
              <tr key={g.key} data-testid="group-row">
                <th scope="row">{g.key}</th>
                <td>{g.total}</td>
                {TIER_LABELS.map(([key]) => (
                  <td key={key}>{g.tiers[key]}</td>
                ))}
                <td>{pct(g.click_rate)}</td>
                <td>{pct(g.submission_rate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      ) : (
        <p style={{ color: color.textMuted, margin: 0 }}>No group large enough to report individually.</p>
      )}
      <SuppressionNote suppressed={interactions.suppressed} />
    </>
  );
}

function TrainingSummary({ training }) {
  if (training.total_participants === 0) {
    return <p data-testid="no-training">No training assignments yet.</p>;
  }
  if (training.totals_suppressed) {
    return <p data-testid="training-suppressed">Too few assignments to report.</p>;
  }
  return (
    <p data-testid="training-completion">
      Training completion: {pct(training.totals.completion_rate)} ({training.totals.completed} of{' '}
      {training.totals.total} completed)
    </p>
  );
}

export default function CampaignAnalytics({ campaignId }) {
  const [groupBy, setGroupBy] = useState('cohort');
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.campaignAnalytics(campaignId, groupBy);
      setReport(data);
    } catch (_e) {
      setError('Could not load analytics.');
    } finally {
      setLoading(false);
    }
  }, [campaignId, groupBy]);

  useEffect(() => {
    load();
  }, [load]);

  // Save the anonymized CSV. The blob is fetched with the bearer token (a link
  // cannot carry a header credential) and handed to a synthetic anchor, which is
  // the only way a browser will write a fetched body to disk. The object URL is
  // revoked immediately after the click so the blob is not retained.
  //
  // What is downloaded is the same aggregate the panel already shows — group
  // rows with small groups suppressed server-side (guardrail #5). There is no
  // per-individual export to offer, and none should be added here.
  async function downloadCsv() {
    setExporting(true);
    setExportError(null);
    try {
      const { blob, filename } = await fetchAnalyticsExport(campaignId, groupBy);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (_e) {
      setExportError('Could not export the CSV.');
    } finally {
      setExporting(false);
    }
  }

  return (
    <section aria-label="campaign analytics" data-testid="campaign-analytics" className="cs-panel">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div className="cs-seg" role="group" aria-label="group by">
          {GROUP_BYS.map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={groupBy === value}
              disabled={groupBy === value}
              onClick={() => setGroupBy(value)}
            >
              By {label}
            </button>
          ))}
        </div>
        {/* Open to any authenticated operator, like the report itself —
            analysis is the Researcher's job, and the export carries no more
            than the panel above it. */}
        <Button
          type="button"
          variant="secondary"
          onClick={downloadCsv}
          disabled={exporting || loading || Boolean(error)}
          data-testid="export-csv"
        >
          {exporting ? 'Exporting…' : 'Export CSV'}
        </Button>
      </div>
      {exportError && (
        <p role="alert" style={{ color: color.danger, margin: 0 }}>{exportError}</p>
      )}

      {loading && <p style={{ color: color.textMuted, margin: 0 }}>Loading analytics…</p>}
      {error && <p role="alert" style={{ color: color.danger, margin: 0 }}>{error}</p>}

      {!loading && !error && report && (
        <>
          <InteractionTable interactions={report.interactions} />
          <TrainingSummary training={report.training} />
        </>
      )}
    </section>
  );
}
