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

  // The landing screen used to carry a self-enrolment form that posted nowhere
  // and then claimed "You are enrolled." These pin the replacement, and the
  // reason for it: consent in CAT-Sim is organisational and cohort-level
  // (guardrail #3), so nobody can add themselves to a simulation from a public
  // page — and a public "type an email -> get enrolled" endpoint would let
  // anyone make this system mail a phishing simulation to a third party.
  describe('landing screen', () => {
    it('collects nothing — no form, and no text or email input', async () => {
      const { container } = render(<App />);
      await waitFor(() =>
        expect(screen.getByTestId('health')).toHaveTextContent('ok')
      );

      expect(container.querySelector('form')).toBeNull();
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
      expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
      expect(container.querySelector('input')).toBeNull();
      expect(container.querySelector('select')).toBeNull();
    });

    it('offers the lessons, which are genuinely open, as the primary action', async () => {
      render(<App />);
      await waitFor(() =>
        expect(screen.getByTestId('health')).toHaveTextContent('ok')
      );

      const cta = screen.getByTestId('start-lessons');
      expect(cta).toHaveAttribute('href', '#/learn');
      expect(cta).toHaveTextContent(/start the lessons/i);
    });

    it('never claims the visitor has been enrolled', async () => {
      render(<App />);
      await waitFor(() =>
        expect(screen.getByTestId('health')).toHaveTextContent('ok')
      );

      // The old fabricated confirmation. Nothing on a page that stores nothing
      // may assert that a person is now enrolled in anything.
      expect(screen.queryByText(/you are enrolled/i)).not.toBeInTheDocument();
      // Instead it says where enrolment actually happens.
      expect(screen.getByText(/cannot add yourself/i)).toBeInTheDocument();
    });

    it('issues no request other than the health check', async () => {
      render(<App />);
      await waitFor(() =>
        expect(screen.getByTestId('health')).toHaveTextContent('ok')
      );

      const paths = fetch.mock.calls.map(([url]) => String(url));
      expect(paths).toEqual(['/api/health']);
    });
  });
});
