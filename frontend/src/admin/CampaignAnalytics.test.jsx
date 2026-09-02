import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import CampaignAnalytics from './CampaignAnalytics.jsx';

vi.mock('./api.js', () => ({
  api: { campaignAnalytics: vi.fn() },
}));

import { api } from './api.js';

function report({ groupBy = 'cohort' } = {}) {
  return {
    data: {
      campaign: { id: 'c1', name: 'Baseline', phase_label: 'Phase I', status: 'active' },
      group_by: groupBy,
      min_group_size: 5,
      interactions: {
        total_participants: 12,
        totals_suppressed: false,
        totals: {
          total: 12,
          opened: 10,
          clicked: 6,
          submitted: 3,
          open_rate: 0.8333,
          click_rate: 0.5,
          submission_rate: 0.25,
          tiers: { no_action: 2, opened_only: 4, clicked_only: 3, clicked_submitted: 3 },
        },
        groups: [
          {
            key: 'Retail Banking',
            total: 7,
            opened: 6,
            clicked: 4,
            submitted: 2,
            open_rate: 0.857,
            click_rate: 0.571,
            submission_rate: 0.286,
            tiers: { no_action: 1, opened_only: 2, clicked_only: 2, clicked_submitted: 2 },
          },
        ],
        suppressed: { groups: 1, participants: 5 },
      },
      training: {
        total_participants: 5,
        totals_suppressed: false,
        totals: { total: 5, assigned: 1, in_progress: 1, completed: 3, completion_rate: 0.6 },
        groups: [],
        suppressed: { groups: 0, participants: 0 },
      },
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('CampaignAnalytics', () => {
  it('renders aggregate rates, the four-tier breakdown, and a training rollup', async () => {
    api.campaignAnalytics.mockResolvedValue(report());
    render(<CampaignAnalytics campaignId="c1" />);

    await waitFor(() => expect(screen.getByTestId('overall-rates')).toBeInTheDocument());
    expect(screen.getByTestId('click-rate')).toHaveTextContent('50%');
    expect(screen.getByTestId('submission-rate')).toHaveTextContent('25%');

    const row = screen.getByTestId('group-row');
    expect(within(row).getByText('Retail Banking')).toBeInTheDocument();

    expect(screen.getByTestId('training-completion')).toHaveTextContent(/60%/);
    // Fetched by cohort first.
    expect(api.campaignAnalytics).toHaveBeenCalledWith('c1', 'cohort');
  });

  it('surfaces suppressed small groups rather than hiding them', async () => {
    api.campaignAnalytics.mockResolvedValue(report());
    render(<CampaignAnalytics campaignId="c1" />);
    await waitFor(() => expect(screen.getByTestId('suppression-note')).toBeInTheDocument());
    expect(screen.getByTestId('suppression-note')).toHaveTextContent(/hidden to protect individual privacy/i);
  });

  it('re-fetches grouped by department when toggled', async () => {
    api.campaignAnalytics.mockResolvedValue(report());
    render(<CampaignAnalytics campaignId="c1" />);
    await waitFor(() => expect(screen.getByTestId('overall-rates')).toBeInTheDocument());

    api.campaignAnalytics.mockResolvedValue(report({ groupBy: 'department' }));
    fireEvent.click(screen.getByRole('button', { name: /by department/i }));

    await waitFor(() => expect(api.campaignAnalytics).toHaveBeenCalledWith('c1', 'department'));
  });

  it('shows a privacy message when the whole campaign is too small to report', async () => {
    const small = report();
    small.data.interactions.totals_suppressed = true;
    small.data.interactions.totals = null;
    small.data.interactions.total_participants = 3;
    small.data.interactions.groups = [];
    api.campaignAnalytics.mockResolvedValue(small);

    render(<CampaignAnalytics campaignId="c1" />);
    await waitFor(() => expect(screen.getByTestId('totals-suppressed')).toBeInTheDocument());
    expect(screen.queryByTestId('overall-rates')).not.toBeInTheDocument();
  });

  it('shows an error if analytics cannot be loaded', async () => {
    api.campaignAnalytics.mockRejectedValue(new Error('boom'));
    render(<CampaignAnalytics campaignId="c1" />);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/could not load analytics/i));
  });
});
