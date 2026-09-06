'use strict';

// Mailgun (HTTP API) mail provider tests. Added so the lure's clickable link is
// NOT rewritten by the provider: Mailgun disables click tracking per message
// (`o:tracking-clicks=no`), unlike Brevo. No network — `fetchImpl` is injected.
// Guardrail-adjacent (mirrors mailer.test / mailer.brevo.test): the recipient
// address must never reach recorded metadata or a thrown error (guardrails #2/#6).

const { createMailgunProvider } = require('../src/services/mailer');

const SECRET_RECIPIENT = 'victim@example.test';
const SECRET_SUBJECT = 'do-not-log-this-subject';
const SECRET_BODY = 'super-secret-body-content-xyz';

function okFetch(captured) {
  return async (url, opts) => {
    captured.url = url;
    captured.opts = opts;
    captured.form = new URLSearchParams(opts.body);
    return {
      ok: true,
      status: 200,
      async json() {
        return { id: '<mg-123@sandbox.mailgun.org>', message: 'Queued. Thank you.' };
      },
    };
  };
}

describe('mailgun mail provider', () => {
  test('posts to /v3/<domain>/messages with tracking DISABLED and returns a receipt', async () => {
    const captured = {};
    const mailer = createMailgunProvider({
      apiKey: 'key-test',
      domain: 'sandbox123.mailgun.org',
      from: 'IT Service Desk <no-reply@catsim.invalid>',
      fetchImpl: okFetch(captured),
      sink: () => {},
    });

    const receipt = await mailer.send({
      to: SECRET_RECIPIENT,
      subject: SECRET_SUBJECT,
      html: SECRET_BODY,
      text: SECRET_BODY,
    });

    expect(receipt.status).toBe('accepted');
    expect(receipt.provider).toBe('mailgun');
    expect(receipt.messageId).toBe('<mg-123@sandbox.mailgun.org>');

    // Endpoint + basic auth.
    expect(captured.url).toBe('https://api.mailgun.net/v3/sandbox123.mailgun.org/messages');
    expect(captured.opts.headers.authorization).toBe(
      `Basic ${Buffer.from('api:key-test').toString('base64')}`
    );

    // The whole point: click tracking is off so the lure link is not rewritten.
    expect(captured.form.get('o:tracking-clicks')).toBe('no');
    expect(captured.form.get('o:tracking-opens')).toBe('no');
    expect(captured.form.get('to')).toBe(SECRET_RECIPIENT);
    expect(captured.form.get('from')).toBe('IT Service Desk <no-reply@catsim.invalid>');
  });

  test('honors an EU/custom base URL', async () => {
    const captured = {};
    const mailer = createMailgunProvider({
      apiKey: 'key-test',
      domain: 'sandbox123.mailgun.org',
      baseUrl: 'https://api.eu.mailgun.net',
      fetchImpl: okFetch(captured),
    });
    await mailer.send({ to: SECRET_RECIPIENT, subject: 'x', html: 'y', text: 'y' });
    expect(captured.url).toBe('https://api.eu.mailgun.net/v3/sandbox123.mailgun.org/messages');
  });

  test('records metadata ONLY — the sink never sees the recipient/subject/body', async () => {
    const records = [];
    const mailer = createMailgunProvider({
      apiKey: 'key-test',
      domain: 'sandbox123.mailgun.org',
      fetchImpl: okFetch({}),
      sink: (r) => records.push(r),
    });
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

  test('an HTTP error throws a STATUS-ONLY message — never the address Mailgun echoes', async () => {
    const mailer = createMailgunProvider({
      apiKey: 'key-test',
      domain: 'sandbox123.mailgun.org',
      fetchImpl: async () => ({
        ok: false,
        status: 400,
        async json() {
          return { message: `${SECRET_RECIPIENT} is not an authorized recipient` };
        },
      }),
      sink: () => {},
    });

    await expect(
      mailer.send({ to: SECRET_RECIPIENT, subject: 'x', html: 'y', text: 'y' })
    ).rejects.toThrow(/mailgun send failed \(http_400\)/);

    await mailer
      .send({ to: SECRET_RECIPIENT, subject: 'x', html: 'y', text: 'y' })
      .catch((err) => {
        expect(err.message).not.toContain(SECRET_RECIPIENT);
      });
  });

  test('a network error throws a code-only message', async () => {
    const mailer = createMailgunProvider({
      apiKey: 'key-test',
      domain: 'sandbox123.mailgun.org',
      fetchImpl: async () => {
        const e = new Error('connect ETIMEDOUT 1.2.3.4:443');
        e.code = 'ETIMEDOUT';
        throw e;
      },
      sink: () => {},
    });
    await expect(
      mailer.send({ to: SECRET_RECIPIENT, subject: 'x', html: 'y', text: 'y' })
    ).rejects.toThrow(/mailgun send failed \(ETIMEDOUT\)/);
  });

  test('fails closed without an API key', () => {
    expect(() =>
      createMailgunProvider({ apiKey: '', domain: 'd.mailgun.org', fetchImpl: okFetch({}) })
    ).toThrow(/MAIL_API_KEY is required/);
  });

  test('fails closed without a domain', () => {
    expect(() =>
      createMailgunProvider({ apiKey: 'key-test', domain: '', fetchImpl: okFetch({}) })
    ).toThrow(/MAILGUN_DOMAIN is required/);
  });

  test('rejects a message with no recipient', async () => {
    const mailer = createMailgunProvider({
      apiKey: 'key-test',
      domain: 'sandbox123.mailgun.org',
      fetchImpl: okFetch({}),
    });
    await expect(mailer.send({ subject: 'x' })).rejects.toThrow(/to/);
  });
});
