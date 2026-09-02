'use strict';

// SMTP provider tests. The transport is injected (a fake `sendMail`), so these
// stay hermetic — no SMTP server, no network, safe for CI.
//
// The load-bearing assertions are the guardrail ones: the SMTP provider must
// record METADATA ONLY, exactly like the console provider, and must never let
// a provider error carry the recipient address outward. An SMTP failure
// message routinely echoes the address back ("550 no such user <x@y.test>"),
// which is the one realistic way an address could escape into a log or trace.

const { createMailer, createSmtpProvider } = require('../src/services/mailer');

const SECRET_RECIPIENT = 'victim@example.test';
const SECRET_SUBJECT = 'do-not-log-this-subject';
const SECRET_BODY = 'super-secret-body-content-xyz';
const SECRET_PASS = 'super-secret-smtp-password';

function fakeTransport(impl) {
  const calls = [];
  return {
    calls,
    sendMail: async (msg) => {
      calls.push(msg);
      if (impl) return impl(msg);
      return { messageId: '<abc123@mailpit>' };
    },
  };
}

describe('smtp mail provider', () => {
  test('sends through the transport and returns the provider message id', async () => {
    const tx = fakeTransport();
    const mailer = createSmtpProvider({ transport: tx, from: 'IT <no-reply@catsim.invalid>', sink: () => {} });

    const receipt = await mailer.send({
      to: SECRET_RECIPIENT,
      subject: SECRET_SUBJECT,
      html: SECRET_BODY,
      text: SECRET_BODY,
    });

    expect(receipt).toEqual({
      messageId: '<abc123@mailpit>',
      provider: 'smtp',
      status: 'accepted',
    });
    expect(tx.calls).toHaveLength(1);
    expect(tx.calls[0]).toMatchObject({
      from: 'IT <no-reply@catsim.invalid>',
      to: SECRET_RECIPIENT,
      subject: SECRET_SUBJECT,
    });
  });

  test('GUARDRAIL: sink receives metadata ONLY — never recipient, subject, or body', async () => {
    const records = [];
    const mailer = createSmtpProvider({ transport: fakeTransport(), sink: (r) => records.push(r) });

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
    expect(Object.keys(records[0]).sort()).toEqual(['messageId', 'provider', 'status']);
  });

  test('GUARDRAIL: default (no sink) logs metadata only', async () => {
    const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const mailer = createSmtpProvider({ transport: fakeTransport() });
      await mailer.send({ to: SECRET_RECIPIENT, subject: SECRET_SUBJECT, html: SECRET_BODY });
      const logged = spy.mock.calls.map((c) => c.join(' ')).join('\n');
      expect(logged).not.toContain(SECRET_RECIPIENT);
      expect(logged).not.toContain(SECRET_SUBJECT);
      expect(logged).not.toContain(SECRET_BODY);
      expect(logged).toContain('provider=smtp');
    } finally {
      spy.mockRestore();
    }
  });

  test('GUARDRAIL: a provider error never carries the recipient address outward', async () => {
    // A realistic SMTP rejection: the address is echoed in the error message.
    const err = new Error(`550 5.1.1 no such user <${SECRET_RECIPIENT}>`);
    err.code = 'EENVELOPE';
    const mailer = createSmtpProvider({
      transport: fakeTransport(() => {
        throw err;
      }),
      sink: () => {},
    });

    expect.assertions(4);
    try {
      await mailer.send({ to: SECRET_RECIPIENT, subject: SECRET_SUBJECT, html: SECRET_BODY });
    } catch (thrown) {
      expect(thrown.message).not.toContain(SECRET_RECIPIENT);
      expect(thrown.message).not.toContain(SECRET_SUBJECT);
      // The error CODE is kept so a misconfiguration stays debuggable.
      expect(thrown.message).toContain('EENVELOPE');
      expect(thrown.stack).not.toContain(SECRET_RECIPIENT);
    }
  });

  test('GUARDRAIL: the SMTP password is never logged or returned', async () => {
    const records = [];
    const mailer = createSmtpProvider({
      transport: fakeTransport(),
      user: 'apikey',
      pass: SECRET_PASS,
      sink: (r) => records.push(r),
    });
    const receipt = await mailer.send({ to: SECRET_RECIPIENT, subject: 'x', html: 'y' });
    expect(JSON.stringify(records)).not.toContain(SECRET_PASS);
    expect(JSON.stringify(receipt)).not.toContain(SECRET_PASS);
  });

  test('rejects a message with no recipient', async () => {
    const mailer = createSmtpProvider({ transport: fakeTransport(), sink: () => {} });
    await expect(mailer.send({ subject: 'x' })).rejects.toThrow(/to/);
  });

  test('fails closed at construction when no host is configured', () => {
    expect(() => createSmtpProvider({ host: null })).toThrow(/SMTP_HOST/);
  });

  test('is reachable through the provider registry', () => {
    expect(createMailer({ provider: 'smtp', transport: fakeTransport() }).name).toBe('smtp');
  });
});
