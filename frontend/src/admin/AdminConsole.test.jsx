import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import AdminConsole from './AdminConsole.jsx';

// The api client is mocked so the console can be tested without a backend.
vi.mock('./api.js', () => {
  const store = { token: null };
  return {
    getToken: () => store.token,
    setToken: (t) => {
      store.token = t;
    },
    api: {
      login: vi.fn(),
      me: vi.fn(),
      listCampaigns: vi.fn(),
      createCampaign: vi.fn(),
      campaignTransition: vi.fn(),
      campaignAnalytics: vi.fn(),
      cloneCampaign: vi.fn(),
      campaignPhases: vi.fn(),
      compareCampaigns: vi.fn(),
      sendCampaign: vi.fn(),
      notifyEnrollments: vi.fn(),
      // Gap 3 — cohorts, participants and consent. The api client is mocked
      // wholesale here, so anything CohortPanel/ParticipantRoster can reach
      // must exist on the mock or those panels throw on mount.
      listCohorts: vi.fn(),
      createCohort: vi.fn(),
      updateCohort: vi.fn(),
      deleteCohort: vi.fn(),
      grantCohortConsent: vi.fn(),
      withdrawCohortConsent: vi.fn(),
      listParticipants: vi.fn(),
      createParticipant: vi.fn(),
      updateParticipant: vi.fn(),
      deleteParticipant: vi.fn(),
      participantOptOut: vi.fn(),
      participantOptIn: vi.fn(),
      lookupParticipant: vi.fn(),
    },
  };
});

import { api, setToken } from './api.js';

beforeEach(() => {
  setToken(null);
  vi.clearAllMocks();
});

afterEach(() => {
  setToken(null);
});

describe('AdminConsole', () => {
  it('shows the login form when signed out', () => {
    render(<AdminConsole />);
    expect(screen.getByRole('form', { name: /admin login/i })).toBeInTheDocument();
  });

  it('logs in and lists campaigns; program admin sees write controls', async () => {
    api.login.mockResolvedValue({
      token: 'tok',
      admin: { email: 'admin@example.test', role: 'program_admin' },
    });
    api.listCampaigns.mockResolvedValue({
      data: [{ id: 'k1', name: 'Baseline', status: 'draft' }],
    });

    render(<AdminConsole />);
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'admin@example.test' },
    });
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: 'pw' },
    });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => expect(screen.getByTestId('campaign')).toBeInTheDocument());
    expect(screen.getByText('Baseline')).toBeInTheDocument();
    expect(screen.getByTestId('status')).toHaveTextContent('draft');
    // Program admin can create and transition.
    expect(screen.getByRole('form', { name: /create campaign/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /activate/i })).toBeInTheDocument();
  });

  it('activates a campaign via the lifecycle control', async () => {
    api.login.mockResolvedValue({
      token: 'tok',
      admin: { email: 'admin@example.test', role: 'program_admin' },
    });
    api.listCampaigns
      .mockResolvedValueOnce({ data: [{ id: 'k1', name: 'Baseline', status: 'draft' }] })
      .mockResolvedValueOnce({ data: [{ id: 'k1', name: 'Baseline', status: 'active' }] });
    api.campaignTransition.mockResolvedValue({ data: { id: 'k1', status: 'active' } });

    render(<AdminConsole />);
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'a@b.c' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'pw' } });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => expect(screen.getByRole('button', { name: /activate/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /activate/i }));

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('active'));
    expect(api.campaignTransition).toHaveBeenCalledWith('k1', 'activate');
  });

  it('toggles the aggregate analytics panel for a campaign', async () => {
    api.login.mockResolvedValue({
      token: 'tok',
      admin: { email: 'admin@example.test', role: 'program_admin' },
    });
    api.listCampaigns.mockResolvedValue({
      data: [{ id: 'k1', name: 'Baseline', status: 'active' }],
    });
    api.campaignAnalytics.mockResolvedValue({
      data: {
        campaign: { id: 'k1', name: 'Baseline', phase_label: null, status: 'active' },
        group_by: 'cohort',
        min_group_size: 5,
        interactions: {
          total_participants: 0,
          totals_suppressed: false,
          totals: {
            total: 0,
            opened: 0,
            clicked: 0,
            submitted: 0,
            open_rate: 0,
            click_rate: 0,
            submission_rate: 0,
            tiers: { no_action: 0, opened_only: 0, clicked_only: 0, clicked_submitted: 0 },
          },
          groups: [],
          suppressed: { groups: 0, participants: 0 },
        },
        training: {
          total_participants: 0,
          totals_suppressed: false,
          totals: null,
          groups: [],
          suppressed: { groups: 0, participants: 0 },
        },
      },
    });

    render(<AdminConsole />);
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'a@b.c' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'pw' } });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => expect(screen.getByTestId('campaign')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /^analytics$/i }));

    await waitFor(() => expect(screen.getByTestId('campaign-analytics')).toBeInTheDocument());
    expect(api.campaignAnalytics).toHaveBeenCalledWith('k1', 'cohort');
  });

  it('clones a campaign as a new phase (Phase 10)', async () => {
    api.login.mockResolvedValue({
      token: 'tok',
      admin: { email: 'admin@example.test', role: 'program_admin' },
    });
    api.listCampaigns.mockResolvedValue({
      data: [{ id: 'k1', name: 'Baseline', status: 'completed' }],
    });
    api.cloneCampaign.mockResolvedValue({
      data: { id: 'k2', name: 'Baseline', status: 'draft', cloned_from_campaign_id: 'k1' },
    });

    render(<AdminConsole />);
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'a@b.c' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'pw' } });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => expect(screen.getByTestId('campaign')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /clone as new phase/i }));

    fireEvent.change(screen.getByLabelText(/clone phase label/i), {
      target: { value: 'Phase II' },
    });
    fireEvent.click(screen.getByRole('button', { name: /create clone/i }));

    await waitFor(() =>
      expect(api.cloneCampaign).toHaveBeenCalledWith('k1', {
        name: 'Baseline',
        phase_label: 'Phase II',
      })
    );
    // The list is refreshed after a successful clone.
    expect(api.listCampaigns).toHaveBeenCalledTimes(2);
  });

  it('toggles the phase comparison panel for a campaign (Phase 10)', async () => {
    api.login.mockResolvedValue({
      token: 'tok',
      admin: { email: 'r@example.test', role: 'researcher' },
    });
    api.listCampaigns.mockResolvedValue({
      data: [{ id: 'k1', name: 'Baseline', status: 'completed' }],
    });
    api.campaignPhases.mockResolvedValue({ data: [{ id: 'k1' }, { id: 'k2' }] });
    api.compareCampaigns.mockResolvedValue({
      data: {
        min_group_size: 5,
        baseline_campaign_id: 'k1',
        campaigns: [
          {
            campaign: { id: 'k1', name: 'Baseline', phase_label: 'Phase I', status: 'completed' },
            total_participants: 10,
            suppressed: false,
            metrics: { open_rate: 0.8, click_rate: 0.5, submission_rate: 0.3, tiers: {} },
          },
          {
            campaign: { id: 'k2', name: 'Baseline', phase_label: 'Phase II', status: 'active' },
            total_participants: 10,
            suppressed: false,
            metrics: { open_rate: 0.7, click_rate: 0.3, submission_rate: 0.1, tiers: {} },
          },
        ],
        deltas: [
          { campaign_id: 'k2', open_rate_delta: -0.1, click_rate_delta: -0.2, submission_rate_delta: -0.2 },
        ],
      },
    });

    render(<AdminConsole />);
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'r@b.c' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'pw' } });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => expect(screen.getByTestId('campaign')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /compare phases/i }));

    await waitFor(() => expect(screen.getByTestId('phase-comparison')).toBeInTheDocument());
    expect(api.campaignPhases).toHaveBeenCalledWith('k1');
    expect(api.compareCampaigns).toHaveBeenCalledWith(['k1', 'k2']);
    // A researcher (read-only) can still compare, but cannot clone.
    expect(screen.queryByRole('button', { name: /clone as new phase/i })).not.toBeInTheDocument();
  });

  it('a researcher gets a read-only view (no create form, no controls)', async () => {
    api.login.mockResolvedValue({
      token: 'tok',
      admin: { email: 'r@example.test', role: 'researcher' },
    });
    api.listCampaigns.mockResolvedValue({
      data: [{ id: 'k1', name: 'Baseline', status: 'active' }],
    });

    render(<AdminConsole />);
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'r@b.c' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'pw' } });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => expect(screen.getByTestId('campaign')).toBeInTheDocument());
    expect(screen.queryByRole('form', { name: /create campaign/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /pause/i })).not.toBeInTheDocument();
    // Delivery is a write: a Researcher must not be offered it. The backend
    // gates /send on Program Admin too; this keeps the UI from showing a
    // control that could only ever 403.
    expect(screen.queryByRole('button', { name: /^send$/i })).not.toBeInTheDocument();
  });

  it('offers the send control to a Program Admin', async () => {
    api.login.mockResolvedValue({
      token: 'tok',
      admin: { email: 'admin@example.test', role: 'program_admin' },
    });
    api.listCampaigns.mockResolvedValue({
      data: [{ id: 'k1', name: 'Baseline', status: 'active' }],
    });

    render(<AdminConsole />);
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'a@b.c' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'pw' } });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => expect(screen.getByTestId('campaign')).toBeInTheDocument());
    const send = screen.getByRole('button', { name: /^send$/i });
    expect(send).toBeInTheDocument();
    fireEvent.click(send);
    expect(screen.getByLabelText('recipient addresses')).toBeInTheDocument();
  });

  it('switches to the cohorts & consent area and back (Gap 3)', async () => {
    api.login.mockResolvedValue({
      token: 'tok',
      admin: { email: 'admin@example.test', role: 'program_admin' },
    });
    api.listCampaigns.mockResolvedValue({
      data: [{ id: 'k1', name: 'Baseline', status: 'active' }],
    });
    api.listCohorts.mockResolvedValue({
      data: [{ id: 'co1', name: 'Retail Ops', consent_status: 'pending' }],
    });
    api.listParticipants.mockResolvedValue({ data: [] });

    render(<AdminConsole />);
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'a@b.c' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'pw' } });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => expect(screen.getByTestId('campaign')).toBeInTheDocument());
    // Campaigns is the default area; cohorts is not fetched until asked for.
    expect(api.listCohorts).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Cohorts & consent' }));

    await waitFor(() => expect(screen.getByTestId('cohort-panel')).toBeInTheDocument());
    expect(screen.getByText('Retail Ops')).toBeInTheDocument();
    expect(screen.queryByTestId('campaign')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Campaigns' }));
    await waitFor(() => expect(screen.getByTestId('campaign')).toBeInTheDocument());
  });

  it('a researcher reaches the cohorts area but gets no consent controls', async () => {
    api.login.mockResolvedValue({
      token: 'tok',
      admin: { email: 'r@example.test', role: 'researcher' },
    });
    api.listCampaigns.mockResolvedValue({ data: [] });
    api.listCohorts.mockResolvedValue({
      data: [{ id: 'co1', name: 'Retail Ops', consent_status: 'granted' }],
    });
    api.listParticipants.mockResolvedValue({ data: [] });

    render(<AdminConsole />);
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'r@b.c' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'pw' } });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Cohorts & consent' })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Cohorts & consent' }));

    await waitFor(() => expect(screen.getByTestId('cohort-panel')).toBeInTheDocument());
    // Consent state is readable — it is needed to interpret a report — but the
    // transitions are Program Admin only on the backend too (consent.authz.guardrail).
    expect(screen.getByTestId('consent-status')).toHaveTextContent('Consent granted');
    expect(screen.queryByRole('button', { name: 'Withdraw consent' })).not.toBeInTheDocument();
    expect(screen.queryByRole('form', { name: 'create cohort' })).not.toBeInTheDocument();
  });

  it('surfaces an invalid-credentials error', async () => {
    api.login.mockRejectedValue(Object.assign(new Error('bad'), { code: 'invalid_credentials' }));
    render(<AdminConsole />);
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'a@b.c' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'nope' } });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/invalid email or password/i)
    );
  });
});
