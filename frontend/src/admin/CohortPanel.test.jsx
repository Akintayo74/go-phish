import React from 'react';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import CohortPanel, { countsByCohort } from './CohortPanel.jsx';
import { api } from './api.js';

const RETAIL = {
  id: 'co1',
  name: 'Retail Ops',
  description: 'Branch-facing staff',
  consent_status: 'granted',
  consent_granted_at: '2026-03-04T10:00:00.000Z',
};
const TREASURY = { id: 'co2', name: 'Treasury', consent_status: 'pending' };

const P_RETAIL = {
  id: 'p1',
  cohort_id: 'co1',
  email_or_phone_hash: '4a3f9c21' + 'b'.repeat(56),
  role: 'Teller',
  department: 'Retail Operations',
  opted_out: false,
  created_at: '2026-02-01T09:00:00.000Z',
};
const P_RETAIL_OUT = { ...P_RETAIL, id: 'p2', email_or_phone_hash: '77ee1100', opted_out: true };
const P_TREASURY = { ...P_RETAIL, id: 'p3', cohort_id: 'co2', email_or_phone_hash: 'aabbccdd' };

function mountPanel({
  canWrite = true,
  cohorts = [RETAIL, TREASURY],
  participants = [P_RETAIL, P_RETAIL_OUT, P_TREASURY],
} = {}) {
  vi.spyOn(api, 'listCohorts').mockResolvedValue({ data: cohorts });
  // The panel fetches the whole roster to derive per-cohort counts; an opened
  // ParticipantRoster fetches its own cohort-scoped list. Honour the argument
  // so both callers get what the backend would actually return.
  vi.spyOn(api, 'listParticipants').mockImplementation(async (cohortId) => ({
    data: cohortId ? participants.filter((p) => p.cohort_id === cohortId) : participants,
  }));
  render(<CohortPanel canWrite={canWrite} />);
  return waitFor(() => expect(screen.getByTestId('cohort-panel')).toBeInTheDocument());
}

function click(name) {
  fireEvent.click(screen.getByRole('button', { name }));
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('countsByCohort', () => {
  it('buckets participants per cohort and applies that cohort’s consent state', () => {
    const counts = countsByCohort([P_RETAIL, P_RETAIL_OUT, P_TREASURY], [RETAIL, TREASURY]);
    expect(counts.get('co1')).toEqual({ total: 2, deliverable: 1, optedOut: 1 });
    // Treasury has a member, but its consent is pending — nobody is deliverable.
    expect(counts.get('co2')).toEqual({ total: 1, deliverable: 0, optedOut: 0 });
  });

  it('gives an empty cohort zeroes rather than nothing', () => {
    const counts = countsByCohort([], [RETAIL]);
    expect(counts.get('co1')).toEqual({ total: 0, deliverable: 0, optedOut: 0 });
  });
});

describe('the cohort list', () => {
  it('lists cohorts with their consent state', async () => {
    await mountPanel();
    const cohorts = screen.getAllByTestId('cohort');
    expect(cohorts).toHaveLength(2);
    expect(within(cohorts[0]).getByTestId('consent-status')).toHaveTextContent('Consent granted');
    expect(within(cohorts[1]).getByTestId('consent-status')).toHaveTextContent('Consent pending');
  });

  it('shows how many participants each cohort holds and how many are deliverable', async () => {
    await mountPanel();
    const cohorts = screen.getAllByTestId('cohort');
    expect(within(cohorts[0]).getByTestId('cohort-counts')).toHaveTextContent(
      '2 participants · 1 deliverable · 1 opted out'
    );
    // Consent pending, so its one member is not deliverable.
    expect(within(cohorts[1]).getByTestId('cohort-counts')).toHaveTextContent(
      '1 participant · 0 deliverable'
    );
  });

  it('says the consent rule up front', async () => {
    await mountPanel();
    expect(screen.getByTestId('cohort-panel')).toHaveTextContent(
      /no campaign can be delivered to anyone whose cohort has not granted consent/i
    );
  });

  it('says so when there are no cohorts', async () => {
    await mountPanel({ cohorts: [], participants: [] });
    expect(screen.getByText(/no cohorts yet/i)).toBeInTheDocument();
  });

  it('surfaces a load failure', async () => {
    vi.spyOn(api, 'listCohorts').mockRejectedValue(new Error('boom'));
    vi.spyOn(api, 'listParticipants').mockResolvedValue({ data: [] });
    render(<CohortPanel canWrite />);
    await waitFor(() => expect(screen.getByText(/could not load cohorts/i)).toBeInTheDocument());
  });
});

describe('creating a cohort', () => {
  it('creates it and reloads', async () => {
    await mountPanel({ cohorts: [], participants: [] });
    const spy = vi.spyOn(api, 'createCohort').mockResolvedValue({ data: TREASURY });

    fireEvent.change(screen.getByLabelText('cohort name'), { target: { value: ' Treasury ' } });
    fireEvent.change(screen.getByLabelText('cohort description'), {
      target: { value: 'Back office' },
    });
    click('Create cohort');

    await waitFor(() =>
      expect(spy).toHaveBeenCalledWith({ name: 'Treasury', description: 'Back office' })
    );
    await waitFor(() => expect(api.listCohorts).toHaveBeenCalledTimes(2));
  });

  it('says new cohorts start unconsented, so nobody expects otherwise', async () => {
    await mountPanel({ cohorts: [], participants: [] });
    expect(screen.getByRole('form', { name: 'create cohort' })).toHaveTextContent(
      /start with consent pending/i
    );
  });

  it('offers no way to create an already-consented cohort', async () => {
    // The backend refuses consent_status on create, and the form must not
    // pretend otherwise — consent is a separate, deliberate act.
    await mountPanel({ cohorts: [], participants: [] });
    const form = screen.getByRole('form', { name: 'create cohort' });
    expect(within(form).queryByLabelText(/consent/i)).not.toBeInTheDocument();
    expect(within(form).queryByRole('checkbox')).not.toBeInTheDocument();
  });
});

describe('consent from the cohort list', () => {
  it('grants consent for a pending cohort and reloads', async () => {
    await mountPanel();
    const spy = vi
      .spyOn(api, 'grantCohortConsent')
      .mockResolvedValue({ data: { ...TREASURY, consent_status: 'granted' } });

    const treasury = screen.getAllByTestId('cohort')[1];
    fireEvent.click(within(treasury).getByRole('button', { name: 'Grant consent' }));
    click('Yes, grant consent');

    await waitFor(() => expect(spy).toHaveBeenCalledWith('co2'));
    await waitFor(() => expect(api.listCohorts).toHaveBeenCalledTimes(2));
  });

  it('tells the grant confirmation how many people it affects', async () => {
    await mountPanel();
    const treasury = screen.getAllByTestId('cohort')[1];
    fireEvent.click(within(treasury).getByRole('button', { name: 'Grant consent' }));

    expect(screen.getByRole('group', { name: 'confirm consent grant' })).toHaveTextContent(
      '1 participant'
    );
  });
});

describe('editing a cohort', () => {
  it('saves the metadata and reloads', async () => {
    await mountPanel();
    const spy = vi.spyOn(api, 'updateCohort').mockResolvedValue({ data: RETAIL });

    click('edit cohort Retail Ops');
    fireEvent.change(screen.getByLabelText('edited cohort name'), {
      target: { value: 'Retail Operations' },
    });
    fireEvent.change(screen.getByLabelText('edited cohort description'), {
      target: { value: 'All branch staff' },
    });
    click('Save');

    await waitFor(() =>
      expect(spy).toHaveBeenCalledWith('co1', {
        name: 'Retail Operations',
        description: 'All branch staff',
      })
    );
    await waitFor(() => expect(api.listCohorts).toHaveBeenCalledTimes(2));
  });

  it('offers no way to change consent while editing metadata', async () => {
    // The backend refuses consent_status on PATCH; the form must not suggest
    // consent is ordinary metadata that can be edited alongside a rename.
    await mountPanel();
    click('edit cohort Retail Ops');
    const form = screen.getByRole('form', { name: 'edit cohort Retail Ops' });

    expect(within(form).queryByLabelText(/consent/i)).not.toBeInTheDocument();
    expect(within(form).queryByRole('checkbox')).not.toBeInTheDocument();
    expect(within(form).queryByRole('button', { name: /consent/i })).not.toBeInTheDocument();
  });
});

describe('deleting a cohort', () => {
  it('asks first, then deletes', async () => {
    await mountPanel();
    const spy = vi.spyOn(api, 'deleteCohort').mockResolvedValue(null);

    click('delete cohort Treasury');
    expect(spy).not.toHaveBeenCalled();

    click('Yes, delete cohort');
    await waitFor(() => expect(spy).toHaveBeenCalledWith('co2'));
  });

  it('explains the backend refusal when the cohort still has members', async () => {
    await mountPanel();
    const err = Object.assign(new Error('conflict'), {
      status: 409,
      code: 'cohort_has_participants',
    });
    vi.spyOn(api, 'deleteCohort').mockRejectedValue(err);

    click('delete cohort Retail Ops');
    click('Yes, delete cohort');

    await waitFor(() =>
      expect(screen.getByText(/still has participants\. remove them first/i)).toBeInTheDocument()
    );
  });
});

describe('the roster drill-down', () => {
  it('opens and closes the roster for one cohort', async () => {
    await mountPanel();
    const retail = screen.getAllByTestId('cohort')[0];

    fireEvent.click(within(retail).getByRole('button', { name: 'Participants' }));
    await waitFor(() => expect(screen.getByTestId('participant-roster')).toBeInTheDocument());
    expect(api.listParticipants).toHaveBeenCalledWith('co1');

    fireEvent.click(within(retail).getByRole('button', { name: 'Hide participants' }));
    expect(screen.queryByTestId('participant-roster')).not.toBeInTheDocument();
  });
});

describe('role gating', () => {
  it('a researcher sees consent state and counts but no controls', async () => {
    await mountPanel({ canWrite: false });

    expect(screen.getAllByTestId('consent-status')[0]).toHaveTextContent('Consent granted');
    expect(screen.getAllByTestId('cohort-counts')[0]).toHaveTextContent('2 participants');

    expect(screen.queryByRole('form', { name: 'create cohort' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Grant consent' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Withdraw consent' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^delete cohort/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^edit cohort/ })).not.toBeInTheDocument();
  });

  it('a researcher can still open a roster read-only', async () => {
    await mountPanel({ canWrite: false });
    const retail = screen.getAllByTestId('cohort')[0];
    fireEvent.click(within(retail).getByRole('button', { name: 'Participants' }));

    await waitFor(() => expect(screen.getByTestId('participant-roster')).toBeInTheDocument());
    expect(screen.getByTestId('summary-total')).toHaveTextContent('2');
    expect(screen.queryByRole('form', { name: 'add participant' })).not.toBeInTheDocument();
  });
});
