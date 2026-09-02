import React, { useCallback, useEffect, useState } from 'react';
import { api } from './api.js';

// Participant roster for one cohort (Gap 3).
//
// The governing constraint here is that participants are PSEUDONYMOUS by
// construction (guardrail #6). Only a keyed hash of the contact is stored and
// the key lives on the server, so this screen cannot show you who anyone is —
// only their role, department, cohort, and opt-out state. The design leans into
// that rather than working around it:
//
//   * Rows are identified by a short prefix of the stored hash. It is a stable,
//     non-reversible handle an operator can quote in a support thread ("the
//     participant 4a3f9c21 asked to be removed") without naming a person.
//   * Because a hash prefix is useless for finding a *specific* person, the
//     "find by address" control exists: the operator holds the raw address
//     (that is their data, not ours), and the backend resolves it. That is the
//     only way an individual opt-out request is actionable without a database
//     client.
//
// TWO THINGS THIS COMPONENT DELIBERATELY DOES NOT DO:
//
//   1. It does not show per-person behaviour. There is no "clicked" or
//      "submitted" column and this must not gain one — `interactions` is
//      deliberately a separate table, and joining it into a roster would turn
//      an aggregate-only system into a per-individual surveillance surface
//      (guardrail #5). Behaviour is reported in the analytics panel, grouped
//      and k-anonymity suppressed. The note rendered below says so on screen,
//      so an operator looking for that column learns why it is absent instead
//      of assuming it is missing by oversight.
//
//   2. It does not persist raw identifiers client-side. The address typed into
//      the add form and the find form lives in component state for exactly as
//      long as it takes to make the request, and is dropped on success — the
//      same discipline SendPanel applies to its roster. Never localStorage,
//      never a query string.

// Short, stable, non-reversible handle for a row (see above).
export function participantRef(participant) {
  return String((participant && participant.email_or_phone_hash) || '').slice(0, 8) || '—';
}

// Mirror of the backend's `ineligibilityReason` (services/consent.js) for
// DISPLAY ONLY. This is a preview of what the send-time gate will decide, not
// the gate itself — the backend re-derives it on every send and is the only
// thing that actually withholds mail. Kept in the same shape and order as the
// server predicate so the two cannot drift silently.
export function participantStatus(participant, cohort) {
  if (!participant) return { key: 'unknown', label: 'Unknown' };
  if (participant.opted_out) return { key: 'participant_opted_out', label: 'Opted out' };
  if (!cohort || cohort.consent_status !== 'granted') {
    return { key: 'cohort_consent_not_granted', label: 'Withheld — cohort consent not granted' };
  }
  return { key: 'deliverable', label: 'Deliverable' };
}

// Aggregate shape of a roster: how many members, how many the consent gate
// would currently let through, how many opted out. Counts only.
export function rosterSummary(participants, cohort) {
  const rows = participants || [];
  let deliverable = 0;
  let optedOut = 0;
  for (const p of rows) {
    const { key } = participantStatus(p, cohort);
    if (key === 'deliverable') deliverable += 1;
    if (key === 'participant_opted_out') optedOut += 1;
  }
  return { total: rows.length, deliverable, optedOut };
}

function AddParticipant({ cohort, onAdded }) {
  const [identifier, setIdentifier] = useState('');
  const [role, setRole] = useState('');
  const [department, setDepartment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [added, setAdded] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setAdded(null);
    try {
      const { data } = await api.createParticipant({
        identifier: identifier.trim(),
        cohort_id: cohort.id,
        role: role.trim() || undefined,
        department: department.trim() || undefined,
      });
      // The address has served its purpose the moment the request returns — the
      // backend kept only a hash of it, and so should the browser.
      setIdentifier('');
      setRole('');
      setDepartment('');
      setAdded(data);
      if (onAdded) onAdded();
    } catch (err) {
      if (err && err.code === 'participant_already_exists') {
        // Terminal for this address, and the backend deliberately does not echo
        // it back — so drop it here too rather than leaving it sitting in the
        // field with nothing left to do with it.
        setIdentifier('');
        setError('That address is already enrolled as a participant.');
      } else if (err && err.status === 403) {
        setError('Only a Program Admin can enrol participants.');
      } else {
        setError('Could not add that participant.');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} aria-label="add participant">
      <h5>Add a participant</h5>
      <label>
        Contact address
        <input
          aria-label="participant contact address"
          placeholder="name@bank.example"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          required
        />
      </label>
      <label>
        Role
        <input
          aria-label="participant role"
          placeholder="e.g. Teller"
          value={role}
          onChange={(e) => setRole(e.target.value)}
        />
      </label>
      <label>
        Department
        <input
          aria-label="participant department"
          placeholder="e.g. Retail Operations"
          value={department}
          onChange={(e) => setDepartment(e.target.value)}
        />
      </label>
      <p role="note">
        The address is used once, to compute a keyed hash. It is not stored, and it is not kept
        in this browser after the participant is added.
      </p>
      {error && <p role="alert">{error}</p>}
      {added && (
        <p role="status" data-testid="added-participant">
          Enrolled as participant {participantRef(added)}.
        </p>
      )}
      <button type="submit" disabled={busy || identifier.trim() === ''}>
        {busy ? 'Adding…' : 'Add participant'}
      </button>
    </form>
  );
}

// Resolve a raw address to a participant row so an opt-out request can be acted
// on. The match is rendered as the same pseudonymous summary as any other row —
// reference, role, department, status — never the address that found it.
function FindParticipant({ cohort, onResolved, onChanged }) {
  const [identifier, setIdentifier] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [match, setMatch] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMatch(null);
    try {
      const { data } = await api.lookupParticipant(identifier.trim());
      // Dropped on success, exactly as in the add form and SendPanel.
      setIdentifier('');
      setMatch(data);
      if (onResolved) onResolved(data);
    } catch (err) {
      if (err && err.status === 404) {
        // Left in the field on a miss so a typo can be corrected — the operator
        // is looking at their own address, which is what they just typed.
        setError('No participant is enrolled with that address.');
      } else if (err && err.status === 403) {
        setError('Only a Program Admin can look up a participant.');
      } else {
        setError('Lookup failed.');
      }
    } finally {
      setBusy(false);
    }
  }

  const inThisCohort = match && match.cohort_id === cohort.id;

  return (
    <form onSubmit={submit} aria-label="find participant">
      <h5>Find a participant by address</h5>
      <p role="note">
        Rows are pseudonymous, so a name or address cannot be read off the roster. If someone has
        asked to be removed, resolve their address here and opt them out.
      </p>
      <label>
        Contact address
        <input
          aria-label="participant address to find"
          placeholder="name@bank.example"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          required
        />
      </label>
      {error && <p role="alert">{error}</p>}
      <button type="submit" disabled={busy || identifier.trim() === ''}>
        {busy ? 'Finding…' : 'Find'}
      </button>

      {match && (
        <div role="status" data-testid="lookup-match">
          <p>
            Participant {participantRef(match)} — {match.role || 'role not recorded'},{' '}
            {match.department || 'department not recorded'}.{' '}
            {inThisCohort ? (
              <>Status: {participantStatus(match, cohort).label}.</>
            ) : (
              <>Enrolled in a different cohort.</>
            )}
          </p>
          {inThisCohort && (
            <OptOutButton
              participant={match}
              onChanged={(updated) => {
                if (updated) setMatch(updated);
                if (onChanged) onChanged();
              }}
              labelSuffix=" (found)"
            />
          )}
        </div>
      )}
    </form>
  );
}

function OptOutButton({ participant, onChanged, labelSuffix = '' }) {
  const [busy, setBusy] = useState(false);
  const ref = participantRef(participant);
  const optedOut = participant.opted_out === true;

  async function run() {
    setBusy(true);
    try {
      const { data } = optedOut
        ? await api.participantOptIn(participant.id)
        : await api.participantOptOut(participant.id);
      // Hand the updated row back: a caller holding its own copy (the lookup
      // result below) would otherwise keep offering the action it just took.
      if (onChanged) onChanged(data);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={run}
      disabled={busy}
      aria-label={`${optedOut ? 'opt in' : 'opt out'} participant ${ref}${labelSuffix}`}
    >
      {optedOut ? 'Opt back in' : 'Opt out'}
    </button>
  );
}

// Edit a participant's role and department. Worth having rather than telling an
// operator to delete and re-enrol: role and department are the ONLY dimensions
// the analytics panel groups by, so a wrong department does not just look
// untidy — it silently misattributes that person's behaviour in every aggregate
// report. The identifier hash is immutable (identity is fixed) and opt-out
// state is not editable here; both move only through their own endpoints.
function EditParticipant({ participant, onSaved }) {
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState(participant.role || '');
  const [department, setDepartment] = useState(participant.department || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const ref = participantRef(participant);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.updateParticipant(participant.id, {
        role: role.trim() || null,
        department: department.trim() || null,
      });
      setOpen(false);
      if (onSaved) onSaved();
    } catch (err) {
      setError(
        err && err.status === 403
          ? 'Only a Program Admin can edit a participant.'
          : 'Could not save those changes.'
      );
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`edit participant ${ref}`}
      >
        Edit
      </button>
    );
  }

  return (
    <form onSubmit={submit} aria-label={`edit participant ${ref}`}>
      <input
        aria-label={`edited role for participant ${ref}`}
        placeholder="Role"
        value={role}
        onChange={(e) => setRole(e.target.value)}
      />
      <input
        aria-label={`edited department for participant ${ref}`}
        placeholder="Department"
        value={department}
        onChange={(e) => setDepartment(e.target.value)}
      />
      {error && <p role="alert">{error}</p>}
      <button type="submit" disabled={busy}>
        {busy ? 'Saving…' : 'Save'}
      </button>
      <button type="button" onClick={() => setOpen(false)} disabled={busy}>
        Cancel
      </button>
    </form>
  );
}

// Removal is offered, but opt-out is the better answer to "take me off this":
// it honours the request immediately AND keeps the record that the person was
// enrolled and withdrew, which is the trail an ethics review asks for. Deletion
// is for a genuine erasure request or a mis-enrolment, so it is confirmed and
// says what it costs.
function RemoveParticipant({ participant, onChanged }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = participantRef(participant);

  async function remove() {
    setBusy(true);
    try {
      await api.deleteParticipant(participant.id);
      if (onChanged) onChanged();
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        aria-label={`remove participant ${ref}`}
      >
        Remove
      </button>
    );
  }

  return (
    <span role="group" aria-label={`confirm removal of participant ${ref}`}>
      <span>
        Deleting participant {ref} erases the record that they were ever enrolled. To stop
        contacting them while keeping that record, opt them out instead.
      </span>
      <button type="button" onClick={remove} disabled={busy}>
        {busy ? 'Removing…' : 'Yes, delete'}
      </button>
      <button type="button" onClick={() => setConfirming(false)} disabled={busy}>
        Cancel
      </button>
    </span>
  );
}

export default function ParticipantRoster({ cohort, canWrite, onRosterChanged }) {
  const [participants, setParticipants] = useState([]);
  // `ready` (rather than a plain `loading`) so a REFRESH never unmounts the
  // content. Every write below reloads the roster, and blanking the section
  // while that happens would remount the forms — throwing away the enrolment
  // receipt and the lookup match at the exact moment the operator needs to
  // read them.
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState(null);
  const [highlightId, setHighlightId] = useState(null);

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const { data } = await api.listParticipants(cohort.id);
      setParticipants(data || []);
      setReady(true);
    } catch (_e) {
      setError('Could not load the roster.');
    } finally {
      setBusy(false);
    }
  }, [cohort.id]);

  useEffect(() => {
    load();
  }, [load]);

  const refresh = useCallback(async () => {
    await load();
    if (onRosterChanged) onRosterChanged();
  }, [load, onRosterChanged]);

  const summary = rosterSummary(participants, cohort);

  return (
    <section aria-label={`participants in ${cohort.name}`} data-testid="participant-roster">
      {!ready && busy && <p>Loading roster…</p>}
      {error && <p role="alert">{error}</p>}

      {ready && (
        <>
          <dl data-testid="roster-summary">
            <div>
              <dt>Participants</dt>
              <dd data-testid="summary-total">{summary.total}</dd>
            </div>
            <div>
              <dt>Currently deliverable</dt>
              <dd data-testid="summary-deliverable">{summary.deliverable}</dd>
            </div>
            <div>
              <dt>Opted out</dt>
              <dd data-testid="summary-opted-out">{summary.optedOut}</dd>
            </div>
          </dl>

          {participants.length === 0 ? (
            <p>No participants in this cohort yet.</p>
          ) : (
            <table>
              <caption>
                Participants are pseudonymous — only a keyed hash of each contact is stored, so
                rows are identified by a reference, not a name. Whether someone clicked or
                submitted is not shown here and is not available per person; behaviour is
                reported in aggregate under Analytics.
              </caption>
              <thead>
                <tr>
                  <th scope="col">Reference</th>
                  <th scope="col">Role</th>
                  <th scope="col">Department</th>
                  <th scope="col">Delivery status</th>
                  <th scope="col">Enrolled</th>
                  {canWrite && <th scope="col">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {participants.map((p) => {
                  const status = participantStatus(p, cohort);
                  return (
                    <tr
                      key={p.id}
                      data-testid="participant-row"
                      data-highlighted={p.id === highlightId ? 'true' : undefined}
                    >
                      <th scope="row">{participantRef(p)}</th>
                      <td>{p.role || '—'}</td>
                      <td>{p.department || '—'}</td>
                      <td data-testid="participant-status">{status.label}</td>
                      <td>{p.created_at ? new Date(p.created_at).toLocaleDateString() : '—'}</td>
                      {canWrite && (
                        <td>
                          <OptOutButton participant={p} onChanged={refresh} />
                          <EditParticipant participant={p} onSaved={refresh} />
                          <RemoveParticipant participant={p} onChanged={refresh} />
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          {canWrite && (
            <>
              <FindParticipant
                cohort={cohort}
                onResolved={(p) => setHighlightId(p.id)}
                onChanged={refresh}
              />
              <AddParticipant cohort={cohort} onAdded={refresh} />
            </>
          )}
        </>
      )}
    </section>
  );
}
