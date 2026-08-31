import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import PhaseComparison from './PhaseComparison.jsx';

vi.mock('./api.js', () => ({
  api: { campaignPhases: vi.fn(), compareCampaigns: vi.fn() },
}));

import { api } from './api.js';

beforeEach(() => {
  vi.clearAllMocks();
});

function twoPhases() {
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
          campaign: { id: 'k2', name: 'Retest', phase_label: 'Phase II', status: 'active' },
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
}

describe('PhaseComparison', () => {
  it('loads the phase family and compares it side by side', async () => {
    twoPhases();
    render(<PhaseComparison campaignId="k1" />);

    await waitFor(() => expect(screen.getByTestId('phase-comparison')).toBeInTheDocument());
    expect(api.campaignPhases).toHaveBeenCalledWith('k1');
    expect(api.compareCampaigns).toHaveBeenCalledWith(['k1', 'k2']);

    const rows = screen.getAllByTestId('phase-row');
    expect(rows).toHaveLength(2);
    // Baseline row is labelled and has no delta.
    expect(within(rows[0]).getByTestId('baseline-badge')).toBeInTheDocument();
    // Phase II shows its rates and the drop from baseline.
    expect(within(rows[1]).getByText('Phase II')).toBeInTheDocument();
    expect(within(rows[1]).getByTestId('submission-delta')).toHaveTextContent('-20pp');
  });

  it('marks a falling susceptibility metric as a downward change', async () => {
    twoPhases();
    render(<PhaseComparison campaignId="k1" />);

    await waitFor(() => expect(screen.getByTestId('phase-comparison')).toBeInTheDocument());
    const rows = screen.getAllByTestId('phase-row');
    expect(within(rows[1]).getByTestId('submission-delta')).toHaveAttribute('data-direction', 'down');
  });

  it('prompts to clone when there is only one phase', async () => {
    api.campaignPhases.mockResolvedValue({ data: [{ id: 'k1' }] });
    api.compareCampaigns.mockResolvedValue({
      data: {
        min_group_size: 5,
        baseline_campaign_id: 'k1',
        campaigns: [
          {
            campaign: { id: 'k1', name: 'Baseline', phase_label: 'Phase I', status: 'active' },
            total_participants: 10,
            suppressed: false,
            metrics: { open_rate: 0.8, click_rate: 0.5, submission_rate: 0.3, tiers: {} },
          },
        ],
        deltas: [],
      },
    });

    render(<PhaseComparison campaignId="k1" />);
    await waitFor(() => expect(screen.getByTestId('single-phase-note')).toBeInTheDocument());
    expect(screen.getAllByTestId('phase-row')).toHaveLength(1);
  });

  it('shows a suppressed phase without exposing metrics', async () => {
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
            campaign: { id: 'k2', name: 'Retest', phase_label: 'Phase II', status: 'active' },
            total_participants: 3,
            suppressed: true,
            metrics: null,
          },
        ],
        deltas: [], // a suppressed side yields no delta
      },
    });

    render(<PhaseComparison campaignId="k1" />);
    await waitFor(() => expect(screen.getByTestId('phase-suppressed')).toBeInTheDocument());
    expect(screen.getByTestId('phase-suppressed')).toHaveTextContent(/too few targets/i);
  });

  it('surfaces a load error', async () => {
    api.campaignPhases.mockRejectedValue(new Error('boom'));
    render(<PhaseComparison campaignId="k1" />);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/could not load/i));
  });
});
