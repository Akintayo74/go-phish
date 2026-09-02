import React from 'react';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ParticipantRoster, {
  participantRef,
  participantStatus,
  rosterSummary,
} from './ParticipantRoster.jsx';
import { api } from './api.js';

const CONSENTED = { id: 'co1', name: 'Retail Ops', consent_status: 'granted' };
const PENDING = { id: 'co1', name: 'Retail Ops', consent_status: 'pending' };

const P1 = {
  id: 'p1',
  cohort_id: 'co1',
  email_or_phone_hash: '4a3f9c21' + 'b'.repeat(56),
  role: 'Teller',
  department: 'Retail Operations',
  opted_out: false,
  created_at: '2026-02-01T09:00:00.000Z',
};
const P2 = {
  id: 'p2',
  cohort_id: 'co1',
  email_or_phone_hash: '77ee1100' + 'c'.repeat(56),
  role: 'Branch Manager',
  department: 'Retail Operations',
  opted_out: true,
  opted_out_at: '2026-02-10T09:00:00.000Z',
  created_at: '2026-02-01T09:00:00.000Z',
};

function mountRoster({ cohort = CONSENTED, canWrite = true, rows = [P1, P2] } = {}) {
  vi.spyOn(api, 'listParticipants').mockResolvedValue({ data: rows });
  render(<ParticipantRoster cohort={cohort} canWrite={canWrite} />);
  return waitFor(() => expect(screen.getByTestId('roster-summary')).toBeInTheDocument());
}

function click(name) {
  fireEvent.click(screen.getByRole('button', { name }));
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('participantRef', () => {
  it('is a short, stable prefix of the stored hash', () => {
    expect(participantRef(P1)).toBe('4a3f9c21');
  });

  it('degrades rather than throwing on a row with no hash', () => {
    expect(participantRef({})).toBe('—');
    expect(participantRef(null)).toBe('—');
  });
});

describe('participantStatus', () => {
  // Mirrors services/consent.js — same precedence, same reason keys.
  it('is deliverable only in a consented cohort with no opt-out', () => {
    expect(participantStatus(P1, CONSENTED).key).toBe('deliverable');
  });

  it('reports an individual opt-out ahead of cohort state', () => {
    expect(participantStatus(P2, CONSENTED).key).toBe('participant_opted_out');
    expect(participantStatus(P2, PENDING).key).toBe('participant_opted_out');
  });

  it('withholds everyone in a cohort that has not granted consent', () => {
    expect(participantStatus(P1, PENDING).key).toBe('cohort_consent_not_granted');
    expect(participantStatus(P1, { consent_status: 'withdrawn' }).key).toBe(
      'cohort_consent_not_granted'
    );
  });

  it('fails closed on missing input, like the server predicate', () => {
    expect(participantStatus(P1, null).key).toBe('cohort_consent_not_granted');
    expect(participantStatus(null, CONSENTED).key).toBe('unknown');
  });
});

describe('rosterSummary', () => {
  it('counts members, deliverable and opted out', () => {
    expect(rosterSummary([P1, P2], CONSENTED)).toEqual({
      total: 2,
      deliverable: 1,
      optedOut: 1,
    });
  });

  it('reports nobody deliverable while consent is pending', () => {
    expect(rosterSummary([P1, P2], PENDING)).toEqual({ total: 2, deliverable: 0, optedOut: 1 });
  });

  it('handles an empty roster', () => {
    expect(rosterSummary([], CONSENTED)).toEqual({ total: 0, deliverable: 0, optedOut: 0 });
  });
});

describe('the roster view', () => {
  it('loads the participants scoped to the cohort', async () => {
    const spy = vi.spyOn(api, 'listParticipants').mockResolvedValue({ data: [P1] });
    render(<ParticipantRoster cohort={CONSENTED} canWrite />);
    await waitFor(() => expect(screen.getByTestId('roster-summary')).toBeInTheDocument());
    expect(spy).toHaveBeenCalledWith('co1');
  });

  it('shows aggregate counts for the cohort', async () => {
    await mountRoster();
    expect(screen.getByTestId('summary-total')).toHaveTextContent('2');
    expect(screen.getByTestId('summary-deliverable')).toHaveTextContent('1');
    expect(screen.getByTestId('summary-opted-out')).toHaveTextContent('1');
  });

  it('identifies rows by reference, role and department — never a name', async () => {
    await mountRoster();
    const rows = screen.getAllByTestId('participant-row');
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText('4a3f9c21')).toBeInTheDocument();
    expect(within(rows[0]).getByText('Teller')).toBeInTheDocument();
    expect(within(rows[0]).getByText('Retail Operations')).toBeInTheDocument();
  });

  it('shows the delivery status the consent gate would apply', async () => {
    await mountRoster();
    const statuses = screen.getAllByTestId('participant-status');
    expect(statuses[0]).toHaveTextContent('Deliverable');
    expect(statuses[1]).toHaveTextContent('Opted out');
  });

  it('shows nobody as deliverable while the cohort consent is pending', async () => {
    await mountRoster({ cohort: PENDING });
    const statuses = screen.getAllByTestId('participant-status');
    expect(statuses[0]).toHaveTextContent('Withheld — cohort consent not granted');
    expect(screen.getByTestId('summary-deliverable')).toHaveTextContent('0');
  });

  it('says so when the cohort is empty', async () => {
    await mountRoster({ rows: [] });
    expect(screen.getByText(/no participants in this cohort yet/i)).toBeInTheDocument();
  });

  it('gives a researcher a read-only roster', async () => {
    await mountRoster({ canWrite: false });
    expect(screen.queryByRole('form', { name: 'add participant' })).not.toBeInTheDocument();
    expect(screen.queryByRole('form', { name: 'find participant' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^opt out participant/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^remove participant/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^edit participant/ })).not.toBeInTheDocument();
    // …but the aggregate picture is still theirs to read.
    expect(screen.getByTestId('summary-total')).toHaveTextContent('2');
  });
});

// ---------------------------------------------------------------------------
// GUARDRAIL #5 — aggregate-only reporting.
// ---------------------------------------------------------------------------
// A roster column reading "clicked: yes" would turn an aggregate-only system
// into a per-individual surveillance surface. `interactions` is deliberately a
// separate table and must never be joined into this view. These pin that.
describe('GUARDRAIL: the roster carries no per-person behaviour', () => {
  it('renders no behavioural column or value', async () => {
    await mountRoster();
    // Scoped to the headers and cells: the caption deliberately NAMES the
    // absent behaviour in order to explain the omission, so it is not evidence
    // of a leak. The data is.
    const cells = [
      ...screen.getAllByRole('columnheader'),
      ...screen.getAllByRole('cell'),
      ...screen.getAllByRole('rowheader'),
    ].map((el) => el.textContent);
    for (const pattern of [/clicked/i, /submitted/i, /opened/i, /susceptib/i]) {
      expect(cells.some((text) => pattern.test(text))).toBe(false);
    }
  });

  it('names only the non-behavioural columns', async () => {
    await mountRoster();
    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent);
    expect(headers).toEqual([
      'Reference',
      'Role',
      'Department',
      'Delivery status',
      'Enrolled',
      'Actions',
    ]);
  });

  it('never asks the backend for interaction or analytics data', async () => {
    const analytics = vi.spyOn(api, 'campaignAnalytics');
    await mountRoster();
    expect(analytics).not.toHaveBeenCalled();
  });

  it('explains on screen why behaviour is absent, so it is not read as an omission', async () => {
    await mountRoster();
    expect(screen.getByRole('table')).toHaveTextContent(/reported in aggregate under Analytics/i);
  });
});

// ---------------------------------------------------------------------------
// GUARDRAIL #6 — raw identifiers are transient on the client too.
// Mirrors the SendPanel roster tests.
// ---------------------------------------------------------------------------
describe('adding a participant', () => {
  it('posts the raw identifier with the cohort, role and department', async () => {
    await mountRoster({ rows: [] });
    const spy = vi
      .spyOn(api, 'createParticipant')
      .mockResolvedValue({ data: { ...P1, id: 'p9' } });

    fireEvent.change(screen.getByLabelText('participant contact address'), {
      target: { value: ' Adaeze@bank.test ' },
    });
    fireEvent.change(screen.getByLabelText('participant role'), { target: { value: 'Teller' } });
    fireEvent.change(screen.getByLabelText('participant department'), {
      target: { value: 'Retail Operations' },
    });
    click('Add participant');

    await waitFor(() =>
      expect(spy).toHaveBeenCalledWith({
        identifier: 'Adaeze@bank.test',
        cohort_id: 'co1',
        role: 'Teller',
        department: 'Retail Operations',
      })
    );
  });

  it('confirms the enrolment by reference, not by address', async () => {
    await mountRoster({ rows: [] });
    vi.spyOn(api, 'createParticipant').mockResolvedValue({ data: P1 });

    fireEvent.change(screen.getByLabelText('participant contact address'), {
      target: { value: 'adaeze@bank.test' },
    });
    click('Add participant');

    await waitFor(() => expect(screen.getByTestId('added-participant')).toBeInTheDocument());
    expect(screen.getByTestId('added-participant')).toHaveTextContent('4a3f9c21');
    expect(screen.getByTestId('added-participant').textContent).not.toContain('adaeze');
  });

  it('GUARDRAIL: the raw address is dropped from the DOM once submitted', async () => {
    await mountRoster({ rows: [] });
    vi.spyOn(api, 'createParticipant').mockResolvedValue({ data: P1 });

    fireEvent.change(screen.getByLabelText('participant contact address'), {
      target: { value: 'adaeze@bank.test' },
    });
    click('Add participant');

    await waitFor(() => expect(screen.getByTestId('added-participant')).toBeInTheDocument());
    expect(screen.getByLabelText('participant contact address')).toHaveValue('');
    expect(document.body.textContent).not.toContain('adaeze@bank.test');
  });

  it('GUARDRAIL: the raw address is never written to localStorage', async () => {
    await mountRoster({ rows: [] });
    vi.spyOn(api, 'createParticipant').mockResolvedValue({ data: P1 });
    const setItem = vi.spyOn(Storage.prototype, 'setItem');

    fireEvent.change(screen.getByLabelText('participant contact address'), {
      target: { value: 'private@bank.test' },
    });
    click('Add participant');

    await waitFor(() => expect(screen.getByTestId('added-participant')).toBeInTheDocument());
    for (const call of setItem.mock.calls) {
      expect(String(call[1])).not.toContain('private@bank.test');
    }
  });

  it('reports an already-enrolled address without echoing it', async () => {
    await mountRoster({ rows: [] });
    const err = Object.assign(new Error('conflict'), {
      status: 409,
      code: 'participant_already_exists',
    });
    vi.spyOn(api, 'createParticipant').mockRejectedValue(err);

    fireEvent.change(screen.getByLabelText('participant contact address'), {
      target: { value: 'dupe@bank.test' },
    });
    click('Add participant');

    await waitFor(() =>
      expect(screen.getByText(/already enrolled as a participant/i)).toBeInTheDocument()
    );
    expect(document.body.textContent).not.toContain('dupe@bank.test');
  });

  it('refreshes the roster after a successful add', async () => {
    const list = vi.spyOn(api, 'listParticipants').mockResolvedValue({ data: [] });
    render(<ParticipantRoster cohort={CONSENTED} canWrite />);
    await waitFor(() => expect(screen.getByTestId('roster-summary')).toBeInTheDocument());
    vi.spyOn(api, 'createParticipant').mockResolvedValue({ data: P1 });

    fireEvent.change(screen.getByLabelText('participant contact address'), {
      target: { value: 'a@b.test' },
    });
    click('Add participant');

    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
  });
});

describe('finding a participant by address', () => {
  it('resolves the address and reports the match pseudonymously', async () => {
    await mountRoster();
    const spy = vi.spyOn(api, 'lookupParticipant').mockResolvedValue({ data: P1 });

    fireEvent.change(screen.getByLabelText('participant address to find'), {
      target: { value: 'adaeze@bank.test' },
    });
    click('Find');

    await waitFor(() => expect(screen.getByTestId('lookup-match')).toBeInTheDocument());
    expect(spy).toHaveBeenCalledWith('adaeze@bank.test');
    const match = screen.getByTestId('lookup-match');
    expect(match).toHaveTextContent('4a3f9c21');
    expect(match).toHaveTextContent('Teller');
    expect(match.textContent).not.toContain('adaeze@bank.test');
  });

  it('GUARDRAIL: the looked-up address is dropped once resolved', async () => {
    await mountRoster();
    vi.spyOn(api, 'lookupParticipant').mockResolvedValue({ data: P1 });

    fireEvent.change(screen.getByLabelText('participant address to find'), {
      target: { value: 'adaeze@bank.test' },
    });
    click('Find');

    await waitFor(() => expect(screen.getByTestId('lookup-match')).toBeInTheDocument());
    expect(screen.getByLabelText('participant address to find')).toHaveValue('');
    expect(document.body.textContent).not.toContain('adaeze@bank.test');
  });

  it('opts the found participant out and stops offering the action it just took', async () => {
    await mountRoster();
    vi.spyOn(api, 'lookupParticipant').mockResolvedValue({ data: P1 });
    const optOut = vi
      .spyOn(api, 'participantOptOut')
      .mockResolvedValue({ data: { ...P1, opted_out: true } });

    fireEvent.change(screen.getByLabelText('participant address to find'), {
      target: { value: 'adaeze@bank.test' },
    });
    click('Find');
    await waitFor(() => expect(screen.getByTestId('lookup-match')).toBeInTheDocument());

    click('opt out participant 4a3f9c21 (found)');

    await waitFor(() => expect(optOut).toHaveBeenCalledWith('p1'));
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'opt in participant 4a3f9c21 (found)' })
      ).toBeInTheDocument()
    );
  });

  it('says plainly when no participant matches', async () => {
    await mountRoster();
    const err = Object.assign(new Error('nf'), { status: 404, code: 'participant_not_found' });
    vi.spyOn(api, 'lookupParticipant').mockRejectedValue(err);

    fireEvent.change(screen.getByLabelText('participant address to find'), {
      target: { value: 'nobody@bank.test' },
    });
    click('Find');

    await waitFor(() =>
      expect(screen.getByText(/no participant is enrolled with that address/i)).toBeInTheDocument()
    );
    expect(screen.queryByTestId('lookup-match')).not.toBeInTheDocument();
  });

  it('flags a match that belongs to a different cohort instead of offering the wrong action', async () => {
    await mountRoster();
    vi.spyOn(api, 'lookupParticipant').mockResolvedValue({
      data: { ...P1, cohort_id: 'other-cohort' },
    });

    fireEvent.change(screen.getByLabelText('participant address to find'), {
      target: { value: 'elsewhere@bank.test' },
    });
    click('Find');

    await waitFor(() => expect(screen.getByTestId('lookup-match')).toBeInTheDocument());
    expect(screen.getByTestId('lookup-match')).toHaveTextContent(/different cohort/i);
    expect(
      within(screen.getByTestId('lookup-match')).queryByRole('button')
    ).not.toBeInTheDocument();
  });
});

describe('opt-out and removal from a row', () => {
  it('opts a participant out and reloads', async () => {
    const list = vi.spyOn(api, 'listParticipants').mockResolvedValue({ data: [P1] });
    render(<ParticipantRoster cohort={CONSENTED} canWrite />);
    await waitFor(() => expect(screen.getByTestId('roster-summary')).toBeInTheDocument());
    const spy = vi
      .spyOn(api, 'participantOptOut')
      .mockResolvedValue({ data: { ...P1, opted_out: true } });

    click('opt out participant 4a3f9c21');

    await waitFor(() => expect(spy).toHaveBeenCalledWith('p1'));
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
  });

  it('offers opt back in for someone already opted out', async () => {
    await mountRoster({ rows: [P2] });
    const spy = vi
      .spyOn(api, 'participantOptIn')
      .mockResolvedValue({ data: { ...P2, opted_out: false } });

    click('opt in participant 77ee1100');

    await waitFor(() => expect(spy).toHaveBeenCalledWith('p2'));
  });

  it('does not delete on the first click, and steers toward opt-out instead', async () => {
    await mountRoster({ rows: [P1] });
    const spy = vi.spyOn(api, 'deleteParticipant');

    click('remove participant 4a3f9c21');

    expect(spy).not.toHaveBeenCalled();
    const confirm = screen.getByRole('group', {
      name: 'confirm removal of participant 4a3f9c21',
    });
    expect(confirm).toHaveTextContent(/erases the record that they were ever enrolled/i);
    expect(confirm).toHaveTextContent(/opt them out instead/i);
  });

  it('deletes once confirmed', async () => {
    const list = vi.spyOn(api, 'listParticipants').mockResolvedValue({ data: [P1] });
    render(<ParticipantRoster cohort={CONSENTED} canWrite />);
    await waitFor(() => expect(screen.getByTestId('roster-summary')).toBeInTheDocument());
    const spy = vi.spyOn(api, 'deleteParticipant').mockResolvedValue(null);

    click('remove participant 4a3f9c21');
    click('Yes, delete');

    await waitFor(() => expect(spy).toHaveBeenCalledWith('p1'));
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
  });
});

describe('editing a participant', () => {
  it('saves role and department — the dimensions analytics groups by', async () => {
    const list = vi.spyOn(api, 'listParticipants').mockResolvedValue({ data: [P1] });
    render(<ParticipantRoster cohort={CONSENTED} canWrite />);
    await waitFor(() => expect(screen.getByTestId('roster-summary')).toBeInTheDocument());
    const spy = vi.spyOn(api, 'updateParticipant').mockResolvedValue({ data: P1 });

    click('edit participant 4a3f9c21');
    fireEvent.change(screen.getByLabelText('edited role for participant 4a3f9c21'), {
      target: { value: 'Branch Manager' },
    });
    fireEvent.change(screen.getByLabelText('edited department for participant 4a3f9c21'), {
      target: { value: 'Treasury' },
    });
    click('Save');

    await waitFor(() =>
      expect(spy).toHaveBeenCalledWith('p1', { role: 'Branch Manager', department: 'Treasury' })
    );
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
  });

  it('offers no way to edit the identifier or the opt-out state', async () => {
    // The hash is immutable via the API, and opt-out moves only through its own
    // endpoint — the form must not imply otherwise.
    await mountRoster({ rows: [P1] });
    click('edit participant 4a3f9c21');
    const form = screen.getByRole('form', { name: 'edit participant 4a3f9c21' });

    expect(within(form).queryByLabelText(/address/i)).not.toBeInTheDocument();
    expect(within(form).queryByLabelText(/identifier/i)).not.toBeInTheDocument();
    expect(within(form).queryByLabelText(/opt/i)).not.toBeInTheDocument();
    expect(within(form).queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('cancelling saves nothing', async () => {
    await mountRoster({ rows: [P1] });
    const spy = vi.spyOn(api, 'updateParticipant');

    click('edit participant 4a3f9c21');
    fireEvent.change(screen.getByLabelText('edited role for participant 4a3f9c21'), {
      target: { value: 'Nope' },
    });
    click('Cancel');

    expect(spy).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'edit participant 4a3f9c21' })).toBeInTheDocument();
  });
});

describe('failures', () => {
  it('surfaces a roster load failure', async () => {
    vi.spyOn(api, 'listParticipants').mockRejectedValue(new Error('boom'));
    render(<ParticipantRoster cohort={CONSENTED} canWrite />);
    await waitFor(() =>
      expect(screen.getByText(/could not load the roster/i)).toBeInTheDocument()
    );
  });
});
