import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import SendPanel, { parseRoster } from './SendPanel.jsx';
import { api } from './api.js';

const ACTIVE = { id: 'c1', name: 'Baseline Phase I', status: 'active' };
const DRAFT = { id: 'c2', name: 'Unsent Draft', status: 'draft' };

const SEND_RECEIPT = {
  campaign_id: 'c1',
  total: 3,
  sent: 2,
  skipped: { unknown: 0, not_deliverable: 1, already_sent: 0 },
  failed: 0,
  ineligible_reasons: { cohort_consent_not_granted: 1 },
};

function openPanel(campaign = ACTIVE, props = {}) {
  render(<SendPanel campaign={campaign} {...props} />);
  fireEvent.click(screen.getByRole('button', { name: 'Send' }));
}

function typeRoster(value) {
  fireEvent.change(screen.getByLabelText('recipient addresses'), { target: { value } });
}

function click(name) {
  fireEvent.click(screen.getByRole('button', { name }));
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('parseRoster', () => {
  it('splits on newlines, commas and semicolons and trims', () => {
    expect(parseRoster('a@x.test\n b@x.test , c@x.test ; d@x.test')).toEqual([
      'a@x.test',
      'b@x.test',
      'c@x.test',
      'd@x.test',
    ]);
  });

  it('drops blank entries and handles empty input', () => {
    expect(parseRoster('a@x.test,,\n\n')).toEqual(['a@x.test']);
    expect(parseRoster('')).toEqual([]);
    expect(parseRoster(undefined)).toEqual([]);
  });
});

describe('SendPanel', () => {
  it('is collapsed until opened', () => {
    render(<SendPanel campaign={ACTIVE} />);
    expect(screen.queryByLabelText('recipient addresses')).not.toBeInTheDocument();
  });

  it('counts the parsed roster as it is typed', async () => {
    openPanel();
    typeRoster('a@x.test\nb@x.test');
    expect(screen.getByTestId('roster-count')).toHaveTextContent('2 addresses');
  });

  it('sends the parsed addresses and renders the aggregate receipt', async () => {
    const spy = vi.spyOn(api, 'sendCampaign').mockResolvedValue({ data: SEND_RECEIPT });
    const onSent = vi.fn();
    openPanel(ACTIVE, { onSent });

    typeRoster('a@x.test, b@x.test, c@x.test');
    click('Send simulation');

    await waitFor(() => expect(screen.getByTestId('send-receipt')).toBeInTheDocument());
    expect(spy).toHaveBeenCalledWith('c1', ['a@x.test', 'b@x.test', 'c@x.test'], { resend: false });
    expect(screen.getByTestId('receipt-total')).toHaveTextContent('3');
    expect(screen.getByTestId('receipt-sent')).toHaveTextContent('2');
    expect(screen.getByTestId('receipt-skipped')).toHaveTextContent('1');
    expect(screen.getByTestId('receipt-reasons')).toHaveTextContent(
      'cohort has not granted consent'
    );
    expect(onSent).toHaveBeenCalled();
  });

  it('GUARDRAIL: the roster is dropped from the DOM after a successful send', async () => {
    vi.spyOn(api, 'sendCampaign').mockResolvedValue({ data: SEND_RECEIPT });
    openPanel();

    typeRoster('adaeze@bank.test');
    click('Send simulation');

    await waitFor(() => expect(screen.getByTestId('send-receipt')).toBeInTheDocument());
    // The raw address must not linger anywhere on the client once it has been
    // used — it is the admin's data, held for one request.
    expect(screen.getByLabelText('recipient addresses')).toHaveValue('');
    expect(document.body.textContent).not.toContain('adaeze@bank.test');
  });

  it('GUARDRAIL: the receipt shows counts only, never a recipient', async () => {
    vi.spyOn(api, 'sendCampaign').mockResolvedValue({ data: SEND_RECEIPT });
    openPanel();
    typeRoster('someone@bank.test');
    click('Send simulation');

    await waitFor(() => expect(screen.getByTestId('send-receipt')).toBeInTheDocument());
    expect(screen.getByTestId('send-receipt').textContent).not.toContain('someone@bank.test');
    expect(screen.getByTestId('send-receipt').textContent).not.toContain('@');
  });

  it('GUARDRAIL: the roster is never written to localStorage', async () => {
    vi.spyOn(api, 'sendCampaign').mockResolvedValue({ data: SEND_RECEIPT });
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    openPanel();
    typeRoster('private@bank.test');
    click('Send simulation');

    await waitFor(() => expect(screen.getByTestId('send-receipt')).toBeInTheDocument());
    for (const call of setItem.mock.calls) {
      expect(String(call[1])).not.toContain('private@bank.test');
    }
  });

  it('refuses to send from a non-active campaign and says why', async () => {
    const spy = vi.spyOn(api, 'sendCampaign');
    openPanel(DRAFT);

    expect(screen.getByTestId('not-active')).toHaveTextContent('draft');
    typeRoster('a@x.test');
    expect(screen.getByRole('button', { name: 'Send simulation' })).toBeDisabled();
    expect(spy).not.toHaveBeenCalled();
  });

  it('send is disabled with an empty roster', async () => {
    openPanel();
    expect(screen.getByRole('button', { name: 'Send simulation' })).toBeDisabled();
  });

  it('passes the resend flag when ticked', async () => {
    const spy = vi.spyOn(api, 'sendCampaign').mockResolvedValue({ data: SEND_RECEIPT });
    openPanel();
    typeRoster('a@x.test');
    fireEvent.click(screen.getByLabelText('resend to already-sent recipients'));
    click('Send simulation');
    await waitFor(() => expect(spy).toHaveBeenCalledWith('c1', ['a@x.test'], { resend: true }));
  });

  it('notify uses the enrollment endpoint and labels its receipt', async () => {
    const spy = vi.spyOn(api, 'notifyEnrollments').mockResolvedValue({
      data: {
        campaign_id: 'c1',
        total: 2,
        notified: 1,
        skipped: { unknown: 0, not_deliverable: 0, no_assignment: 1, already_notified: 0 },
        failed: 0,
        ineligible_reasons: {},
      },
    });
    openPanel();
    typeRoster('a@x.test, b@x.test');
    click('Notify enrolled');

    await waitFor(() => expect(screen.getByTestId('send-receipt')).toBeInTheDocument());
    expect(spy).toHaveBeenCalledWith('c1', ['a@x.test', 'b@x.test']);
    expect(screen.getByTestId('receipt-sent')).toHaveTextContent('1');
    expect(screen.getByTestId('receipt-skipped-detail')).toHaveTextContent(
      'no training assignment yet'
    );
  });

  it('surfaces a lifecycle refusal from the backend in plain language', async () => {
    const err = new Error('cannot_send_from_paused');
    err.code = 'cannot_send_from_paused';
    err.status = 409;
    vi.spyOn(api, 'sendCampaign').mockRejectedValue(err);
    openPanel();
    typeRoster('a@x.test');
    click('Send simulation');

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('the campaign is paused')
    );
  });
});
