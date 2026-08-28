'use strict';

// Mailer tests (Phase 5), including a guardrail-adjacent assertion: the console
// provider records METADATA ONLY and never writes the recipient address, the
// subject, or the body to its sink or to the console (guardrail #2).

const { createMailer, createConsoleProvider } = require('../src/services/mailer');

const SECRET_RECIPIENT = 'victim@example.test';
const SECRET_SUBJECT = 'do-not-log-this-subject';
const SECRET_BODY = 'super-secret-body-content-xyz';

describe('console mail provider', () => {
  test('returns an accepted receipt with a message id', async () => {
    const mailer = createConsoleProvider({ sink: () => {} });
    const receipt = await mailer.send({
      to: SECRET_RECIPIENT,
      subject: SECRET_SUBJECT,
      html: SECRET_BODY,
      text: SECRET_BODY,
    });
    expect(receipt.status).toBe('accepted');
    expect(receipt.provider).toBe('console');
    expect(receipt.messageId).toMatch(/^sim-/);
  });

  test('sink receives metadata ONLY — never the recipient, subject, or body', async () => {
    const records = [];
    const mailer = createConsoleProvider({ sink: (r) => records.push(r) });
    await mailer.send({
      to: SECRET_RECIPIENT,
      subject: SECRET_SUBJECT,
      html: SECRET_BODY,
      text: SECRET_BODY,
    });
    expect(records).toHaveLength(1);
    const serialized = JSON.stringify(records[0]);
    expect(serialized).not.toContain(SECRET_RECIPIENT);
    expect(serialized).not.toContain(SECRET_SUBJECT);
    expect(serialized).not.toContain(SECRET_BODY);
    // Only the safe metadata keys are present.
    expect(Object.keys(records[0]).sort()).toEqual(['messageId', 'provider', 'status']);
  });

  test('default (no sink) logs metadata only — no recipient/body to console', async () => {
    const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const mailer = createConsoleProvider();
      await mailer.send({ to: SECRET_RECIPIENT, subject: SECRET_SUBJECT, html: SECRET_BODY });
      const logged = spy.mock.calls.map((c) => c.join(' ')).join('\n');
      expect(logged).not.toContain(SECRET_RECIPIENT);
      expect(logged).not.toContain(SECRET_SUBJECT);
      expect(logged).not.toContain(SECRET_BODY);
    } finally {
      spy.mockRestore();
    }
  });

  test('rejects a message with no recipient', async () => {
    const mailer = createConsoleProvider({ sink: () => {} });
    await expect(mailer.send({ subject: 'x' })).rejects.toThrow(/to/);
  });
});

describe('createMailer', () => {
  test('builds the configured provider', () => {
    expect(createMailer({ provider: 'console' }).name).toBe('console');
  });

  test('fails loudly on an unknown provider (fail closed, no silent non-send)', () => {
    expect(() => createMailer({ provider: 'nope' })).toThrow(/unknown provider/);
  });
});
