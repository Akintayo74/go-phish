import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import App from './App.jsx';

describe('App', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({ json: () => Promise.resolve({ status: 'ok' }) })
      )
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders the app title', async () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: /cat-sim/i })).toBeInTheDocument();
    // Let the async health fetch settle so the state update stays inside act().
    await waitFor(() =>
      expect(screen.getByTestId('health')).toHaveTextContent('ok')
    );
  });

  it('shows backend health once fetched', async () => {
    render(<App />);
    await waitFor(() =>
      expect(screen.getByTestId('health')).toHaveTextContent('ok')
    );
  });
});
