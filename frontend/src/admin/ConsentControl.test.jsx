import React from 'react';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ConsentControl, { ConsentBadge, consentLabel } from './ConsentControl.jsx';
import { api } from './api.js';

// The grant is a press-and-hold, not a click (design 2c): the commit fires only
// after the full hold elapses. This helper opens the confirm group, presses the
// hold control, and advances fake timers past the 1.6s hold so the grant
// commits — the resistance is deliberate and these tests exercise it.
async function holdToGrant() {
  fireEvent.click(screen.getByRole('button', { name: 'Grant consent' }));
  const hold = screen.getByRole('button', { name: /press and hold to grant consent/i });
  fireEvent.mouseDown(hold);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1700);
  });
}

const PENDING = { id: 'co1', name: 'Retail Ops', consent_status: 'pending' };
const GRANTED = {
  id: 'co1',
  name: 'Retail Ops',
  consent_status: 'granted',
  consent_granted_at: '2026-03-04T10:00:00.000Z',
};
const WITHDRAWN = {
  id: 'co1',
  name: 'Retail Ops',
  consent_status: 'withdrawn',
  consent_withdrawn_at: '2026-03-05T10:00:00.000Z',
};

function click(name) {
  fireEvent.click(screen.getByRole('button', { name }));
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('consentLabel', () => {
  it('names each consent state', () => {
    expect(consentLabel('pending')).toBe('Consent pending');
    expect(consentLabel('granted')).toBe('Consent granted');
    expect(consentLabel('withdrawn')).toBe('Consent withdrawn');
  });

  it('does not silently render an unknown state as consented', () => {
    expect(consentLabel('something-else')).toBe('Consent something-else');
    expect(consentLabel(undefined)).toBe('Consent unknown');
  });
});

describe('ConsentBadge', () => {
  it('shows the transition date so a grant is auditable, not just a word', () => {
    render(<ConsentBadge cohort={GRANTED} />);
    expect(screen.getByTestId('consent-status')).toHaveTextContent('Consent granted');
    expect(screen.getByTestId('consent-status')).toHaveTextContent(/since/i);
  });

  it('shows no date for a cohort that has never moved', () => {
    render(<ConsentBadge cohort={PENDING} />);
    expect(screen.getByTestId('consent-status')).toHaveTextContent('Consent pending');
    expect(screen.getByTestId('consent-status')).not.toHaveTextContent(/since/i);
  });
});

describe('granting consent', () => {
  it('offers grant for a pending cohort and withdraw for a granted one', () => {
    const { unmount } = render(<ConsentControl cohort={PENDING} />);
    expect(screen.getByRole('button', { name: 'Grant consent' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Withdraw consent' })).not.toBeInTheDocument();
    unmount();

    render(<ConsentControl cohort={GRANTED} />);
    expect(screen.getByRole('button', { name: 'Withdraw consent' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Grant consent' })).not.toBeInTheDocument();
  });

  it('offers grant again after a withdrawal', () => {
    render(<ConsentControl cohort={WITHDRAWN} />);
    expect(screen.getByRole('button', { name: 'Grant consent' })).toBeInTheDocument();
  });

  it('does not grant on the first click — it asks first', () => {
    const spy = vi.spyOn(api, 'grantCohortConsent');
    render(<ConsentControl cohort={PENDING} memberCount={12} />);
    click('Grant consent');

    expect(spy).not.toHaveBeenCalled();
    expect(screen.getByRole('group', { name: 'confirm consent grant' })).toBeInTheDocument();
  });

  it('does not grant on a mere press — the hold must complete', async () => {
    vi.useFakeTimers();
    const spy = vi.spyOn(api, 'grantCohortConsent').mockResolvedValue({ data: GRANTED });
    render(<ConsentControl cohort={PENDING} memberCount={12} />);
    click('Grant consent');
    const hold = screen.getByRole('button', { name: /press and hold to grant consent/i });
    fireEvent.mouseDown(hold);
    // Release well before the 1.6s hold elapses — nothing is recorded.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    fireEvent.mouseUp(hold);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(spy).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('names how many people the grant makes targetable', () => {
    render(<ConsentControl cohort={PENDING} memberCount={12} />);
    click('Grant consent');
    expect(screen.getByRole('group', { name: 'confirm consent grant' })).toHaveTextContent(
      '12 participants'
    );
  });

  it('restates the operator obligation from the pre-launch checklist', () => {
    // §7 makes the operator responsible for a signed authorisation being on
    // file before a cohort is marked granted. Say it where it applies.
    render(<ConsentControl cohort={PENDING} memberCount={1} />);
    click('Grant consent');
    const confirm = screen.getByRole('group', { name: 'confirm consent grant' });
    expect(confirm).toHaveTextContent(/signed consent or authorisation is on file/i);
    expect(confirm).toHaveTextContent('1 participant');
  });

  it('grants once the hold completes and reports back', async () => {
    vi.useFakeTimers();
    const spy = vi.spyOn(api, 'grantCohortConsent').mockResolvedValue({ data: GRANTED });
    const onChanged = vi.fn();
    render(<ConsentControl cohort={PENDING} memberCount={3} onChanged={onChanged} />);

    await holdToGrant();

    expect(spy).toHaveBeenCalledWith('co1');
    expect(onChanged).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('cancelling leaves consent untouched', () => {
    const spy = vi.spyOn(api, 'grantCohortConsent');
    render(<ConsentControl cohort={PENDING} />);
    click('Grant consent');
    click('Cancel');

    expect(spy).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Grant consent' })).toBeInTheDocument();
  });
});

describe('withdrawing consent', () => {
  it('does not withdraw on the first click — it asks first', () => {
    const spy = vi.spyOn(api, 'withdrawCohortConsent');
    render(<ConsentControl cohort={GRANTED} memberCount={12} />);
    click('Withdraw consent');

    expect(spy).not.toHaveBeenCalled();
    expect(screen.getByRole('group', { name: 'confirm consent withdrawal' })).toBeInTheDocument();
  });

  it('says the withdrawal is immediate, overrides opt-in, and cannot recall sent mail', () => {
    render(<ConsentControl cohort={GRANTED} memberCount={12} />);
    click('Withdraw consent');
    const confirm = screen.getByRole('group', { name: 'confirm consent withdrawal' });

    expect(confirm).toHaveTextContent(/immediately stops all future delivery/i);
    expect(confirm).toHaveTextContent(/including anyone who has individually opted in/i);
    expect(confirm).toHaveTextContent(/does not recall mail already sent/i);
  });

  it('withdraws once confirmed', async () => {
    const spy = vi.spyOn(api, 'withdrawCohortConsent').mockResolvedValue({ data: WITHDRAWN });
    const onChanged = vi.fn();
    render(<ConsentControl cohort={GRANTED} onChanged={onChanged} />);

    click('Withdraw consent');
    click('Yes, withdraw consent');

    await waitFor(() => expect(spy).toHaveBeenCalledWith('co1'));
    expect(onChanged).toHaveBeenCalled();
  });

  it('cancelling leaves consent granted', () => {
    const spy = vi.spyOn(api, 'withdrawCohortConsent');
    render(<ConsentControl cohort={GRANTED} />);
    click('Withdraw consent');
    click('Cancel');

    expect(spy).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Withdraw consent' })).toBeInTheDocument();
  });
});

describe('failures', () => {
  it('surfaces the backend role refusal rather than appearing to succeed', async () => {
    vi.useFakeTimers();
    const err = Object.assign(new Error('forbidden'), { status: 403, code: 'forbidden' });
    vi.spyOn(api, 'grantCohortConsent').mockRejectedValue(err);
    const onChanged = vi.fn();
    render(<ConsentControl cohort={PENDING} onChanged={onChanged} />);

    await holdToGrant();

    expect(screen.getByText(/only a program admin can change consent/i)).toBeInTheDocument();
    // Nothing moved, so the parent is not told to refresh.
    expect(onChanged).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
