import React, { useState } from 'react';
import { api } from './api.js';

// Campaign delivery panel. Program Admin only.
//
// The two sends this drives — the simulation lure and the enrollment
// notification — both take a roster of RAW recipient addresses. The backend
// stores only keyed hashes (guardrail #6), so the roster is the admin's own
// data, supplied transiently for one request and never persisted anywhere.
//
// This component holds to the same rule on the client:
//   * the roster lives in component state only — never localStorage, never a
//     query string, and it is dropped from state on a successful send;
//   * the receipt rendered below is the backend's AGGREGATE summary (guardrail
//     #5). It is counts and reasons only. There is no per-recipient outcome to
//     show, and none should ever be added here — "which of my staff clicked"
//     is exactly what this system is designed not to answer.

// Split a pasted roster on newlines, commas, or semicolons so an admin can
// paste a column out of a spreadsheet or a comma-joined list interchangeably.
export function parseRoster(text) {
  return String(text || '')
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// Ineligibility reasons the backend reports, in operator-readable form. These
// are aggregate counts of WHY targets were withheld — never who.
const REASON_LABELS = {
  cohort_consent_not_granted: 'cohort has not granted consent',
  participant_opted_out: 'participant opted out',
  cohort_missing: 'no cohort on record',
};

function humanizeReason(key) {
  return REASON_LABELS[key] || key.replace(/_/g, ' ');
}

function SendReceipt({ receipt, kind }) {
  if (!receipt) return null;

  const skipped = receipt.skipped || {};
  const skippedTotal = Object.values(skipped).reduce((a, b) => a + b, 0);
  const reasons = Object.entries(receipt.ineligible_reasons || {});
  const delivered = kind === 'notify' ? receipt.notified : receipt.sent;

  return (
    <div data-testid="send-receipt" role="status">
      <dl>
        <div>
          <dt>Addresses submitted</dt>
          <dd data-testid="receipt-total">{receipt.total}</dd>
        </div>
        <div>
          <dt>{kind === 'notify' ? 'Notified' : 'Sent'}</dt>
          <dd data-testid="receipt-sent">{delivered}</dd>
        </div>
        <div>
          <dt>Withheld</dt>
          <dd data-testid="receipt-skipped">{skippedTotal}</dd>
        </div>
        <div>
          <dt>Failed</dt>
          <dd data-testid="receipt-failed">{receipt.failed}</dd>
        </div>
      </dl>

      {skippedTotal > 0 && (
        <ul data-testid="receipt-skipped-detail">
          {skipped.unknown > 0 && <li>{skipped.unknown} not on the participant roster</li>}
          {skipped.not_deliverable > 0 && (
            <li>{skipped.not_deliverable} withheld by the consent gate</li>
          )}
          {skipped.already_sent > 0 && (
            <li>{skipped.already_sent} already sent (tick “resend” to send again)</li>
          )}
          {skipped.no_assignment > 0 && (
            <li>{skipped.no_assignment} have no training assignment yet</li>
          )}
          {skipped.already_notified > 0 && <li>{skipped.already_notified} already notified</li>}
        </ul>
      )}

      {reasons.length > 0 && (
        <p data-testid="receipt-reasons">
          Consent gate:{' '}
          {reasons.map(([key, count], i) => (
            <span key={key}>
              {i > 0 && '; '}
              {count} — {humanizeReason(key)}
            </span>
          ))}
        </p>
      )}
    </div>
  );
}

export default function SendPanel({ campaign, onSent }) {
  const [open, setOpen] = useState(false);
  const [roster, setRoster] = useState('');
  const [resend, setResend] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [receipt, setReceipt] = useState(null);
  const [kind, setKind] = useState('send');

  const addresses = parseRoster(roster);
  const isActive = campaign.status === 'active';

  async function run(which) {
    setError(null);
    setReceipt(null);
    setBusy(true);
    setKind(which);
    try {
      const { data } =
        which === 'notify'
          ? await api.notifyEnrollments(campaign.id, addresses)
          : await api.sendCampaign(campaign.id, addresses, { resend });
      setReceipt(data);
      // Drop the roster as soon as it has served its purpose — it is the only
      // copy of those raw addresses in the browser, and keeping it around gains
      // nothing once the send is done.
      setRoster('');
      setResend(false);
      if (onSent) onSent();
    } catch (err) {
      setError(errorMessage(err, which));
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}>
        Send
      </button>
    );
  }

  return (
    <section aria-label="send campaign">
      <h4>Send “{campaign.name}”</h4>

      {!isActive && (
        <p role="alert" data-testid="not-active">
          This campaign is {campaign.status}. Only an active campaign can send — activate it first.
        </p>
      )}

      <label>
        Recipient addresses
        <textarea
          aria-label="recipient addresses"
          rows={5}
          placeholder={'one per line\nor comma-separated'}
          value={roster}
          onChange={(e) => setRoster(e.target.value)}
        />
      </label>
      <p data-testid="roster-count">
        {addresses.length} address{addresses.length === 1 ? '' : 'es'}
      </p>
      <p role="note">
        Addresses are sent for this request only. The system stores a keyed hash to match each
        one against a consented participant and never keeps the address itself.
      </p>

      <label>
        <input
          type="checkbox"
          aria-label="resend to already-sent recipients"
          checked={resend}
          onChange={(e) => setResend(e.target.checked)}
        />
        Resend to recipients already sent this campaign
      </label>

      {error && <p role="alert">{error}</p>}

      <button
        type="button"
        onClick={() => run('send')}
        disabled={busy || addresses.length === 0 || !isActive}
      >
        {busy && kind === 'send' ? 'Sending…' : 'Send simulation'}
      </button>
      <button
        type="button"
        onClick={() => run('notify')}
        disabled={busy || addresses.length === 0}
      >
        {busy && kind === 'notify' ? 'Notifying…' : 'Notify enrolled'}
      </button>
      <button type="button" onClick={() => setOpen(false)} disabled={busy}>
        Close
      </button>

      <SendReceipt receipt={receipt} kind={kind} />
    </section>
  );
}

// Turn the backend's error code into something an operator can act on. The
// lifecycle refusals are the ones they will actually hit.
function errorMessage(err, which) {
  const code = err && err.code;
  if (code && /^cannot_send_from_/.test(code)) {
    return `Cannot send: the campaign is ${code.replace('cannot_send_from_', '')}. Activate it first.`;
  }
  if (code === 'recipients_required') return 'Enter at least one recipient address.';
  if (code === 'campaign_not_found') return 'That campaign no longer exists.';
  if (err && err.status === 403) return 'Only a Program Admin can send.';
  return which === 'notify' ? 'Notification failed.' : 'Send failed.';
}
