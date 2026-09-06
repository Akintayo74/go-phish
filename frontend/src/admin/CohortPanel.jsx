import React, { useCallback, useEffect, useState } from 'react';
import { api } from './api.js';
import { color, radius, type, tabular, layout } from '../ui/theme.js';
import { Card, Button, Field, Input, Note, QuietNote } from '../ui/primitives.jsx';
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
//
// Layout follows the console's campaign card (AdminConsole): one card per
// cohort built from the shared primitives, a header that carries the name and
// its consent state, and a single horizontal action row rather than a stack of
// full-width buttons. Consent state is the thing an operator scans for, so it
// also drives a left accent rule on the card — granted, pending and withdrawn
// cohorts are told apart at a glance instead of reading as one flat list.

const errorStyle = { margin: 0, color: color.danger, fontSize: 13, lineHeight: 1.5 };

// The left rule + its wash key each card to its consent state. This is the
// at-a-glance hierarchy between cohorts: consent is what the whole panel is
// about, so it is what differentiates one card from the next.
const CONSENT_ACCENT = {
  granted: { rule: color.success, wash: '#f2f7f4' },
  withdrawn: { rule: color.warning, wash: '#faf5ec' },
  pending: { rule: color.borderStrong, wash: color.surfaceRaised },
};

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
    <Card
      as="form"
      raised
      onSubmit={submit}
      aria-label="create cohort"
      style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: layout.form }}
    >
      <h3 style={{ ...type.cardTitle, color: color.ink, margin: 0 }}>New cohort</h3>
      <Field label="Name" htmlFor="new-cohort-name">
        <Input
          id="new-cohort-name"
          aria-label="cohort name"
          placeholder="e.g. Retail Operations"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </Field>
      <Field label="Description" optional htmlFor="new-cohort-description">
        <Input
          id="new-cohort-description"
          aria-label="cohort description"
          placeholder="Scope of this group (optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </Field>
      <Note>
        New cohorts start with consent pending. Nothing can be delivered to them until consent is
        granted as a separate, deliberate step.
      </Note>
      {error && <p role="alert" style={errorStyle}>{error}</p>}
      <Button type="submit" variant="primary" disabled={busy || name.trim() === ''} style={{ alignSelf: 'flex-start' }}>
        {busy ? 'Creating…' : 'Create cohort'}
      </Button>
    </Card>
  );
}

// Edit a cohort's metadata. Consent is pointedly NOT here: the backend refuses
// consent_status on PATCH, so there is nothing to render for it and no way to
// change consent by mistake while renaming a group.
//
// Closed, this is one bordered button in the action row; open, the form breaks
// to its own full-width line (flexBasis:100% inside the wrapping row).
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
      <Button type="button" variant="secondary" onClick={() => setOpen(true)} aria-label={`edit cohort ${cohort.name}`}>
        Edit
      </Button>
    );
  }

  return (
    <form
      onSubmit={submit}
      aria-label={`edit cohort ${cohort.name}`}
      style={{
        flexBasis: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        background: color.surfaceRecessed,
        border: `1px solid ${color.borderSubtle}`,
        borderRadius: radius.nested,
        padding: 16,
      }}
    >
      <Field label="Name" htmlFor={`edit-cohort-name-${cohort.id}`}>
        <Input
          id={`edit-cohort-name-${cohort.id}`}
          aria-label="edited cohort name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </Field>
      <Field label="Description" optional htmlFor={`edit-cohort-description-${cohort.id}`}>
        <Input
          id={`edit-cohort-description-${cohort.id}`}
          aria-label="edited cohort description"
          placeholder="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </Field>
      {error && <p role="alert" style={errorStyle}>{error}</p>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Button type="submit" variant="primary" disabled={busy || name.trim() === ''}>
          {busy ? 'Saving…' : 'Save'}
        </Button>
        <Button type="button" variant="secondary" onClick={() => setOpen(false)} disabled={busy}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

// Deleting a cohort is refused by the backend while it still has participants
// (the FK is ON DELETE RESTRICT), which is the behaviour we want — surface that
// refusal plainly rather than as a generic failure. Delete is the quietest
// control on the card: a bordered button whose label is warm-toned, never an
// ink or accent fill.
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
        {error && <p role="alert" style={{ ...errorStyle, flexBasis: '100%' }}>{error}</p>}
        <Button
          type="button"
          variant="secondary"
          onClick={() => setConfirming(true)}
          aria-label={`delete cohort ${cohort.name}`}
          style={{ color: color.danger }}
        >
          Delete
        </Button>
      </>
    );
  }

  return (
    <div
      role="group"
      aria-label={`confirm deletion of cohort ${cohort.name}`}
      style={{
        flexBasis: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        background: color.dangerWash,
        border: `1px solid ${color.borderSubtle}`,
        borderRadius: radius.nested,
        padding: 16,
      }}
    >
      <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: color.textBody }}>
        Deleting “{cohort.name}” cannot be undone. A cohort that still has participants cannot be
        deleted — remove them first.
      </p>
      {error && <p role="alert" style={errorStyle}>{error}</p>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Button type="button" variant="danger" onClick={remove} disabled={busy}>
          {busy ? 'Deleting…' : 'Yes, delete cohort'}
        </Button>
        <Button type="button" variant="secondary" onClick={() => setConfirming(false)} disabled={busy}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function CohortCard({ cohort, summary, canWrite, open, onToggleRoster, onChanged }) {
  const accent = CONSENT_ACCENT[cohort.consent_status] || CONSENT_ACCENT.pending;
  return (
    <Card
      as="li"
      raised
      data-testid="cohort"
      style={{
        listStyle: 'none',
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        borderLeft: `3px solid ${accent.rule}`,
        background: accent.wash,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <strong style={{ ...type.rowTitle, color: color.ink }}>{cohort.name}</strong>
          <ConsentBadge cohort={cohort} />
        </div>
        <span data-testid="cohort-counts" style={{ fontSize: 13, color: color.textMuted, ...tabular }}>
          {summary.total} participant{summary.total === 1 ? '' : 's'} · {summary.deliverable} deliverable
          {summary.optedOut > 0 && <> · {summary.optedOut} opted out</>}
        </span>
      </div>

      {cohort.description && (
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: color.textSecondary }}>{cohort.description}</p>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <Button
          type="button"
          variant="secondary"
          aria-expanded={open}
          onClick={() => onToggleRoster(cohort.id)}
        >
          {open ? 'Hide participants' : 'Participants'}
        </Button>

        {/* Consent and roster edits are writes: the backend gates them on
            Program Admin (consent.authz.guardrail), so a Researcher is not
            shown a control that could only ever 403. Grant consent is the one
            ink-filled control on the card; everything else is bordered. */}
        {canWrite && <ConsentControl cohort={cohort} memberCount={summary.total} onChanged={onChanged} />}
        {canWrite && <EditCohort cohort={cohort} onSaved={onChanged} />}
        {canWrite && <DeleteCohort cohort={cohort} onDeleted={onChanged} />}
      </div>

      {open && <ParticipantRoster cohort={cohort} canWrite={canWrite} onRosterChanged={onChanged} />}
    </Card>
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
    <section
      aria-label="cohorts and consent"
      data-testid="cohort-panel"
      style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
    >
      <Note>
        A cohort is the unit consent is granted on. No campaign can be delivered to anyone whose
        cohort has not granted consent, and an individual opt-out is always honoured on top of it.
      </Note>

      {error && <p role="alert" style={errorStyle}>{error}</p>}
      {!ready && busy && <p style={{ color: color.textMuted, margin: 0 }}>Loading cohorts…</p>}
      {ready && canWrite && <CreateCohort onCreated={load} />}

      {!ready ? null : cohorts.length === 0 ? (
        <QuietNote style={{ fontSize: 14 }}>No cohorts yet.</QuietNote>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {cohorts.map((cohort) => (
            <CohortCard
              key={cohort.id}
              cohort={cohort}
              summary={counts.get(cohort.id) || { total: 0, deliverable: 0, optedOut: 0 }}
              canWrite={canWrite}
              open={openRoster === cohort.id}
              onToggleRoster={toggleRoster}
              onChanged={load}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
