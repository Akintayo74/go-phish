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
