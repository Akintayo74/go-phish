'use strict';

// Brevo (HTTP API) mail provider tests (added when Render's outbound SMTP ports
// turned out to be blocked — the API path sends over HTTPS/443 instead). No
// network: `fetchImpl` is injected. Guardrail-adjacent, mirroring mailer.test:
// the recipient address must never reach the recorded metadata or a thrown
// error message (guardrails #2/#6), even though Brevo echoes it in error bodies.

const { createBrevoProvider, parseFromAddress } = require('../src/services/mailer');

const SECRET_RECIPIENT = 'victim@example.test';
const SECRET_SUBJECT = 'do-not-log-this-subject';
const SECRET_BODY = 'super-secret-body-content-xyz';

function okFetch(captured) {
  return async (url, opts) => {
    captured.url = url;
    captured.opts = opts;
    captured.body = JSON.parse(opts.body);
    return {
      ok: true,
      status: 201,
      async json() {
        return { messageId: '<brevo-123@relay>' };
      },
    };
  };
}

describe('brevo mail provider', () => {
  test('posts to the Brevo API with sender/to/subject/body and returns a receipt', async () => {
    const captured = {};
    const mailer = createBrevoProvider({
      apiKey: 'xkeysib-test',
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
    expect(receipt.provider).toBe('brevo');
    expect(receipt.messageId).toBe('<brevo-123@relay>');

    // The request carries the api-key header and the parsed sender.
    expect(captured.opts.headers['api-key']).toBe('xkeysib-test');
    expect(captured.body.sender).toEqual({
      name: 'IT Service Desk',
      email: 'no-reply@catsim.invalid',
    });
    expect(captured.body.to).toEqual([{ email: SECRET_RECIPIENT }]);
  });

  test('records metadata ONLY — the sink never sees the recipient/subject/body', async () => {
    const records = [];
    const mailer = createBrevoProvider({
      apiKey: 'xkeysib-test',
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

  test('an HTTP error throws a STATUS-ONLY message — never the address Brevo echoes back', async () => {
    // Brevo's real 400 body includes the offending recipient; simulate that and
    // assert it never reaches the thrown error.
    const mailer = createBrevoProvider({
      apiKey: 'xkeysib-test',
      fetchImpl: async () => ({
        ok: false,
        status: 400,
        async json() {
          return { code: 'invalid_parameter', message: `email ${SECRET_RECIPIENT} is invalid` };
        },
      }),
      sink: () => {},
    });

    await expect(
      mailer.send({ to: SECRET_RECIPIENT, subject: 'x', html: 'y', text: 'y' })
    ).rejects.toThrow(/brevo send failed \(http_400\)/);

    await mailer
      .send({ to: SECRET_RECIPIENT, subject: 'x', html: 'y', text: 'y' })
      .catch((err) => {
        expect(err.message).not.toContain(SECRET_RECIPIENT);
      });
  });

  test('a network error throws a code-only message', async () => {
    const mailer = createBrevoProvider({
      apiKey: 'xkeysib-test',
      fetchImpl: async () => {
        const e = new Error('connect ETIMEDOUT 1.2.3.4:443');
        e.code = 'ETIMEDOUT';
        throw e;
      },
      sink: () => {},
    });
    await expect(
      mailer.send({ to: SECRET_RECIPIENT, subject: 'x', html: 'y', text: 'y' })
    ).rejects.toThrow(/brevo send failed \(ETIMEDOUT\)/);
  });

  test('fails closed when no API key is configured', () => {
    expect(() => createBrevoProvider({ apiKey: '', fetchImpl: okFetch({}) })).toThrow(
      /MAIL_API_KEY is required/
    );
  });

  test('rejects a message with no recipient', async () => {
    const mailer = createBrevoProvider({ apiKey: 'xkeysib-test', fetchImpl: okFetch({}) });
    await expect(mailer.send({ subject: 'x' })).rejects.toThrow(/to/);
  });
});

describe('parseFromAddress', () => {
  test('splits "Name <email>" into name + email', () => {
    expect(parseFromAddress('IT Service Desk <no-reply@catsim.invalid>')).toEqual({
      name: 'IT Service Desk',
      email: 'no-reply@catsim.invalid',
    });
  });

  test('a bare address has no name', () => {
    expect(parseFromAddress('no-reply@catsim.invalid')).toEqual({
      email: 'no-reply@catsim.invalid',
    });
  });
});
