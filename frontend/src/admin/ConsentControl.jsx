import React, { useState } from 'react';
import { api } from './api.js';
import { color } from '../ui/theme.js';
import { Button, Pill, StatusDot, HoldToConfirm } from '../ui/primitives.jsx';

// Cohort consent control (Gap 3). Program Admin only.
//
// This is the single most consequential control in the console. Cohort consent
// is the input to `services/consent.js` — the one predicate every delivery path
// routes through (guardrail #3) — so the two buttons here are literally what
// decide whether a group of real people can be sent a simulated phishing email.
//
// Both transitions are put behind an explicit confirmation, for opposite
// reasons:
//
//   * GRANT fails OPEN. It is the moment a cohort becomes targetable, and the
//     pre-launch checklist (§7) makes the operator responsible for having a
//     signed authorisation on file before they do it. The confirmation is where
//     that obligation gets restated, at the moment it applies, rather than
//     living only in a document nobody re-reads. It also names how many people
//     the click actually affects.
//
//   * WITHDRAW fails SAFE but is immediate and wide: every member of the cohort
//     stops being deliverable at once, regardless of their individual opt-in.
//     The confirmation exists so that is a decision rather than a slip — and so
//     the one thing withdrawal *cannot* do (recall mail already sent) is said
//     out loud instead of being assumed.
//
// Consent is never editable as ordinary metadata: the backend refuses
// consent_status on PATCH, and the api client exposes no way to ask for it.
// These two endpoints are the only route in.

export const CONSENT_LABELS = {
  pending: 'Consent pending',
  granted: 'Consent granted',
  withdrawn: 'Consent withdrawn',
};

export function consentLabel(status) {
  return CONSENT_LABELS[status] || `Consent ${status || 'unknown'}`;
}

// Renders the cohort's consent state plus the timestamp of the last transition,
// so "granted" is auditable rather than just a word.
export function ConsentBadge({ cohort }) {
  const at =
    cohort.consent_status === 'granted'
      ? cohort.consent_granted_at
      : cohort.consent_status === 'withdrawn'
        ? cohort.consent_withdrawn_at
        : null;
  const tone =
    cohort.consent_status === 'granted' ? 'success' : cohort.consent_status === 'withdrawn' ? 'warning' : 'muted';
  const textColor =
    cohort.consent_status === 'granted' ? color.success : cohort.consent_status === 'withdrawn' ? color.warning : color.textMuted;
  return (
    <span
      data-testid="consent-status"
      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 500, color: textColor }}
    >
      <StatusDot tone={tone} ring={cohort.consent_status === 'pending'} />
      {consentLabel(cohort.consent_status)}
      {at && <> (since {new Date(at).toLocaleDateString()})</>}
    </span>
  );
}

function memberPhrase(count) {
  if (count === null || count === undefined) return 'every member of this cohort';
  return `${count} participant${count === 1 ? '' : 's'}`;
}

// The confirmation copy leads every branch; laid out with gap, never margins.
const confirmGroupStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  background: color.surfaceRecessed,
  border: `1px solid ${color.borderSubtle}`,
  borderRadius: 14,
  padding: 16,
};
const confirmProse = { margin: 0, fontSize: 14, lineHeight: 1.6, color: color.textBody };
const errorStyle = { margin: 0, color: color.danger, fontSize: 13, lineHeight: 1.5 };

export default function ConsentControl({ cohort, memberCount = null, onChanged }) {
  const [confirming, setConfirming] = useState(null); // 'grant' | 'withdraw' | null
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  // Bumped on a failed grant so the press-and-hold control remounts and its
  // progress fill resets — a failed grant should not look completed.
  const [holdKey, setHoldKey] = useState(0);

  const isGranted = cohort.consent_status === 'granted';

  async function commit(action) {
    setBusy(true);
    setError(null);
    try {
      if (action === 'grant') await api.grantCohortConsent(cohort.id);
      else await api.withdrawCohortConsent(cohort.id);
      setConfirming(null);
      if (onChanged) onChanged();
    } catch (err) {
      setError(
        err && err.status === 403
          ? 'Only a Program Admin can change consent.'
          : 'Could not change consent.'
      );
      setHoldKey((k) => k + 1);
    } finally {
      setBusy(false);
    }
  }

  if (confirming === 'grant') {
    // The grant is press-and-hold, not click: consent for covert-timing
    // simulation of employees must not be grantable by a misplaced click. The
    // resistance IS the point (handoff 2c) — the hold is calibrated to be
    // completable on purpose but not by accident, and it is keyboard-operable
    // and announced to screen readers (see HoldToConfirm).
    return (
      <div role="group" aria-label="confirm consent grant" style={confirmGroupStyle}>
        <p role="alert" style={confirmProse}>
          Granting consent makes {memberPhrase(memberCount)} in “{cohort.name}” targetable by any
          active campaign. Confirm a signed consent or authorisation is on file for this cohort,
          and that the engagement is scoped to this organisation’s own staff.
        </p>
        {error && <p role="alert" style={errorStyle}>{error}</p>}
        <HoldToConfirm
          key={holdKey}
          busy={busy}
          label="Press and hold to grant consent"
          onComplete={() => commit('grant')}
        >
          Hold to grant consent
        </HoldToConfirm>
        <Button type="button" variant="secondary" onClick={() => setConfirming(null)} disabled={busy}>
          Cancel
        </Button>
      </div>
    );
  }

  if (confirming === 'withdraw') {
    return (
      <div role="group" aria-label="confirm consent withdrawal" style={confirmGroupStyle}>
        <p role="alert" style={confirmProse}>
          Withdrawing consent immediately stops all future delivery to {memberPhrase(memberCount)}{' '}
          in “{cohort.name}”, including anyone who has individually opted in. It does not recall
          mail already sent, and it does not delete data already collected.
        </p>
        {error && <p role="alert" style={errorStyle}>{error}</p>}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button type="button" variant="danger" onClick={() => commit('withdraw')} disabled={busy}>
            {busy ? 'Withdrawing…' : 'Yes, withdraw consent'}
          </Button>
          <Button type="button" variant="secondary" onClick={() => setConfirming(null)} disabled={busy}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <>
      {error && <p role="alert" style={errorStyle}>{error}</p>}
      {isGranted ? (
        <Button type="button" variant="secondary" onClick={() => setConfirming('withdraw')}>
          Withdraw consent
        </Button>
      ) : (
        <Button type="button" variant="primary" onClick={() => setConfirming('grant')}>
          Grant consent
        </Button>
      )}
    </>
  );
}
