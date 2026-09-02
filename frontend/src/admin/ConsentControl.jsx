import React, { useState } from 'react';
import { api } from './api.js';

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
  return (
    <span data-testid="consent-status">
      {consentLabel(cohort.consent_status)}
      {at && <> (since {new Date(at).toLocaleDateString()})</>}
    </span>
  );
}

function memberPhrase(count) {
  if (count === null || count === undefined) return 'every member of this cohort';
  return `${count} participant${count === 1 ? '' : 's'}`;
}

export default function ConsentControl({ cohort, memberCount = null, onChanged }) {
  const [confirming, setConfirming] = useState(null); // 'grant' | 'withdraw' | null
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

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
    } finally {
      setBusy(false);
    }
  }

  if (confirming === 'grant') {
    return (
      <div role="group" aria-label="confirm consent grant">
        <p role="alert">
          Granting consent makes {memberPhrase(memberCount)} in “{cohort.name}” targetable by any
          active campaign. Confirm a signed consent or authorisation is on file for this cohort,
          and that the engagement is scoped to this organisation’s own staff.
        </p>
        {error && <p role="alert">{error}</p>}
        <button type="button" onClick={() => commit('grant')} disabled={busy}>
          {busy ? 'Granting…' : 'Yes, grant consent'}
        </button>
        <button type="button" onClick={() => setConfirming(null)} disabled={busy}>
          Cancel
        </button>
      </div>
    );
  }

  if (confirming === 'withdraw') {
    return (
      <div role="group" aria-label="confirm consent withdrawal">
        <p role="alert">
          Withdrawing consent immediately stops all future delivery to {memberPhrase(memberCount)}{' '}
          in “{cohort.name}”, including anyone who has individually opted in. It does not recall
          mail already sent, and it does not delete data already collected.
        </p>
        {error && <p role="alert">{error}</p>}
        <button type="button" onClick={() => commit('withdraw')} disabled={busy}>
          {busy ? 'Withdrawing…' : 'Yes, withdraw consent'}
        </button>
        <button type="button" onClick={() => setConfirming(null)} disabled={busy}>
          Cancel
        </button>
      </div>
    );
  }

  return (
    <>
      {error && <p role="alert">{error}</p>}
      {isGranted ? (
        <button type="button" onClick={() => setConfirming('withdraw')}>
          Withdraw consent
        </button>
      ) : (
        <button type="button" onClick={() => setConfirming('grant')}>
          Grant consent
        </button>
      )}
    </>
  );
}
