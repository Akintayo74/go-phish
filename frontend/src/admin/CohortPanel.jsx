import React, { useCallback, useEffect, useState } from 'react';
import { api } from './api.js';
import ConsentControl, { ConsentBadge } from './ConsentControl.jsx';
import ParticipantRoster, { rosterSummary } from './ParticipantRoster.jsx';

// Cohort & consent management (Gap 3). The cohort is the unit consent is
// granted on, and cohort consent is the gate every delivery path routes through
// (services/consent.js, guardrail #3). Until now that gate existed only in the
// database: an operator could not see who had consented, move consent, or
// honour an opt-out without a psql session. This panel is that ethical spine
// made visible.
//
// A cohort is always born 'pending' — the backend refuses consent_status on
// create, so there is no "create an already-consented cohort" path to build a
// form for. Consent is a separate, deliberate act; see ConsentControl.

// Per-cohort roster counts, derived from one whole-roster fetch. Counts are
// aggregate (guardrail #5) and are what make the consent decision legible: the
// grant confirmation can then say how many people the click actually affects.
//
// NOTE: this pulls the full participant list to bucket it client-side. That is
// fine at the scale this console is built for (an organisation's own staff),
// but if rosters grow into the tens of thousands it should become a server-side
// aggregate rather than a bigger download.
export function countsByCohort(participants, cohorts) {
  const byId = new Map();
  for (const cohort of cohorts || []) {
    byId.set(
      cohort.id,
      rosterSummary(
        (participants || []).filter((p) => p.cohort_id === cohort.id),
        cohort
      )
    );
  }
  return byId;
}

function CreateCohort({ onCreated }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.createCohort({
        name: name.trim(),
        description: description.trim() || undefined,
      });
      setName('');
      setDescription('');
      onCreated();
    } catch (err) {
      setError(
        err && err.status === 403
          ? 'Only a Program Admin can create a cohort.'
          : 'Could not create that cohort.'
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} aria-label="create cohort">
      <h3>New cohort</h3>
      <label>
        Name
        <input
          aria-label="cohort name"
          placeholder="e.g. Retail Operations"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </label>
      <label>
        Description
        <input
          aria-label="cohort description"
          placeholder="Scope of this group (optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </label>
      <p role="note">
        New cohorts start with consent pending. Nothing can be delivered to them until consent is
        granted as a separate, deliberate step.
      </p>
      {error && <p role="alert">{error}</p>}
      <button type="submit" disabled={busy || name.trim() === ''}>
        {busy ? 'Creating…' : 'Create cohort'}
      </button>
    </form>
  );
}

// Edit a cohort's metadata. Consent is pointedly NOT here: the backend refuses
// consent_status on PATCH, so there is nothing to render for it and no way to
// change consent by mistake while renaming a group.
function EditCohort({ cohort, onSaved }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(cohort.name);
  const [description, setDescription] = useState(cohort.description || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.updateCohort(cohort.id, {
        name: name.trim(),
        description: description.trim() || null,
      });
      setOpen(false);
      onSaved();
    } catch (err) {
      setError(
        err && err.status === 403
          ? 'Only a Program Admin can edit a cohort.'
          : 'Could not save those changes.'
      );
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} aria-label={`edit cohort ${cohort.name}`}>
        Edit
      </button>
    );
  }

  return (
    <form onSubmit={submit} aria-label={`edit cohort ${cohort.name}`}>
      <input
        aria-label="edited cohort name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
      />
      <input
        aria-label="edited cohort description"
        placeholder="Description"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />
      {error && <p role="alert">{error}</p>}
      <button type="submit" disabled={busy || name.trim() === ''}>
        {busy ? 'Saving…' : 'Save'}
      </button>
      <button type="button" onClick={() => setOpen(false)} disabled={busy}>
        Cancel
      </button>
    </form>
  );
}

// Deleting a cohort is refused by the backend while it still has participants
// (the FK is ON DELETE RESTRICT), which is the behaviour we want — surface that
// refusal plainly rather than as a generic failure.
function DeleteCohort({ cohort, onDeleted }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await api.deleteCohort(cohort.id);
      setConfirming(false);
      onDeleted();
    } catch (err) {
      setError(
        err && err.code === 'cohort_has_participants'
          ? 'This cohort still has participants. Remove them first.'
          : 'Could not delete that cohort.'
      );
    } finally {
      setBusy(false);
    }
  }

  if (!confirming) {
    return (
      <>
        {error && <p role="alert">{error}</p>}
        <button
          type="button"
          onClick={() => setConfirming(true)}
          aria-label={`delete cohort ${cohort.name}`}
        >
          Delete
        </button>
      </>
    );
  }

  return (
    <span role="group" aria-label={`confirm deletion of cohort ${cohort.name}`}>
      {error && <p role="alert">{error}</p>}
      <button type="button" onClick={remove} disabled={busy}>
        {busy ? 'Deleting…' : 'Yes, delete cohort'}
      </button>
      <button type="button" onClick={() => setConfirming(false)} disabled={busy}>
        Cancel
      </button>
    </span>
  );
}

export default function CohortPanel({ canWrite }) {
  const [cohorts, setCohorts] = useState([]);
  const [participants, setParticipants] = useState([]);
  // As in ParticipantRoster: `ready` rather than a plain `loading`, so a
  // refresh after a consent change never blanks the panel. Blanking would
  // unmount any open roster underneath it, resetting its lookup match and
  // refetching — a visible flicker in the middle of the operator's task.
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState(null);
  const [openRoster, setOpenRoster] = useState(null);

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const [cohortRes, participantRes] = await Promise.all([
        api.listCohorts(),
        api.listParticipants(),
      ]);
      setCohorts(cohortRes.data || []);
      setParticipants(participantRes.data || []);
      setReady(true);
    } catch (_e) {
      setError('Could not load cohorts.');
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function toggleRoster(id) {
    setOpenRoster((current) => (current === id ? null : id));
  }

  const counts = countsByCohort(participants, cohorts);

  return (
    <section aria-label="cohorts and consent" data-testid="cohort-panel" className="cs-forms">
      <p role="note">
        A cohort is the unit consent is granted on. No campaign can be delivered to anyone whose
        cohort has not granted consent, and an individual opt-out is always honoured on top of
        it.
      </p>

      {error && <p role="alert">{error}</p>}
      {!ready && busy && <p>Loading cohorts…</p>}
      {ready && canWrite && <CreateCohort onCreated={load} />}

      {!ready ? null : cohorts.length === 0 ? (
        <p>No cohorts yet.</p>
      ) : (
        <ul>
          {cohorts.map((cohort) => {
            const summary = counts.get(cohort.id) || { total: 0, deliverable: 0, optedOut: 0 };
            return (
              <li key={cohort.id} data-testid="cohort">
                <strong>{cohort.name}</strong>{' '}
                <ConsentBadge cohort={cohort} />{' '}
                <span data-testid="cohort-counts">
                  {summary.total} participant{summary.total === 1 ? '' : 's'} ·{' '}
                  {summary.deliverable} deliverable
                  {summary.optedOut > 0 && <> · {summary.optedOut} opted out</>}
                </span>
                {cohort.description && <p>{cohort.description}</p>}

                <button
                  type="button"
                  aria-expanded={openRoster === cohort.id}
                  onClick={() => toggleRoster(cohort.id)}
                >
                  {openRoster === cohort.id ? 'Hide participants' : 'Participants'}
                </button>

                {/* Consent and roster edits are writes: the backend gates them
                    on Program Admin (consent.authz.guardrail), so a Researcher
                    is not shown a control that could only ever 403. */}
                {canWrite && (
                  <ConsentControl
                    cohort={cohort}
                    memberCount={summary.total}
                    onChanged={load}
                  />
                )}
                {canWrite && <EditCohort cohort={cohort} onSaved={load} />}
                {canWrite && <DeleteCohort cohort={cohort} onDeleted={load} />}

                {openRoster === cohort.id && (
                  <ParticipantRoster
                    cohort={cohort}
                    canWrite={canWrite}
                    onRosterChanged={load}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
