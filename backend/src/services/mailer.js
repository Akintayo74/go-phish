'use strict';

// Email provider abstraction (Phase 5; SMTP transport added later).
//
// Delivery depends only on the small `send({ to, subject, html, text })`
// contract below, so a real transactional provider can be swapped in without
// touching delivery logic. The default `console` provider is HERMETIC — it
// dispatches nothing over the network and is what tests and CI run against.
//
// GUARDRAIL #2 (bodies/PII never logged): EVERY provider here records only
// non-sensitive metadata (a message id + status). None of them writes the
// recipient address, subject, or body to a log sink, and no credential
// (`mailApiKey`, `SMTP_PASS`) is ever logged. Keep it that way — this module
// doubles as the audit surface that proves a simulated send leaks nothing.

const crypto = require('crypto');
const config = require('../config');

function newMessageId() {
  return `sim-${crypto.randomBytes(9).toString('hex')}`;
}

// Record send metadata. Shared by every provider so the "metadata only" shape
// is defined in exactly one place: adding a field here is the only way to
// change what a send is allowed to record.
function recordSend({ provider, messageId, sink }) {
  const record = { provider, messageId, status: 'accepted' };
  if (typeof sink === 'function') {
    sink(record);
  } else {
    // eslint-disable-next-line no-console
    console.log(`[mail] provider=${provider} status=accepted id=${messageId}`);
  }
  return { messageId, provider, status: 'accepted' };
}

// The console/no-op provider. Returns a resolved receipt; the optional `sink`
// receives metadata ONLY (never `to`/`subject`/`html`/`text`). Tests inject a
// sink to assert exactly what is — and is not — recorded.
function createConsoleProvider({ sink } = {}) {
  return {
    name: 'console',
    async send(message) {
      if (!message || !message.to) {
        throw new Error('mailer: `to` is required');
      }
      return recordSend({ provider: 'console', messageId: newMessageId(), sink });
    },
  };
}

// The SMTP provider. Wraps nodemailer so a real transactional service — or a
// local catcher like Mailpit — actually carries the simulated send, which is
// what removes the need to read tracking tokens out of the database by hand.
//
// Options fall back to config, so `createMailer({ provider: 'smtp' })` works
// from env alone. `transport` injects a pre-built nodemailer-shaped transport
// (anything with `sendMail`) so tests need no SMTP server.
function createSmtpProvider({ sink, transport, ...opts } = {}) {
  const pick = (name, fallback) => (opts[name] !== undefined ? opts[name] : fallback);
  const host = pick('host', config.smtpHost);
  const port = pick('port', config.smtpPort);
  const secure = pick('secure', config.smtpSecure);
  const user = pick('user', config.smtpUser);
  const pass = pick('pass', config.smtpPass);
  const from = pick('from', config.mailFrom);

  // Fail closed at construction rather than silently not sending a campaign.
  if (!transport && !host) {
    throw new Error('mailer: SMTP_HOST is required for the smtp provider');
  }

  // Built lazily so the console path never loads nodemailer.
  let tx = transport || null;
  function client() {
    if (!tx) {
      // eslint-disable-next-line global-require
      const nodemailer = require('nodemailer');
      tx = nodemailer.createTransport({
        host,
        port,
        secure,
        // A local catcher (Mailpit/MailHog) accepts no credentials; only send
        // auth when it is actually configured.
        auth: user ? { user, pass } : undefined,
      });
    }
    return tx;
  }

  return {
    name: 'smtp',
    async send(message) {
      if (!message || !message.to) {
        throw new Error('mailer: `to` is required');
      }

      let info;
      try {
        info = await client().sendMail({
          from,
          to: message.to,
          subject: message.subject,
          html: message.html,
          text: message.text,
        });
      } catch (err) {
        // GUARDRAIL: never re-throw the provider's own message. SMTP errors
        // routinely echo the recipient address back ("550 no such user
        // <someone@bank.test>"), and that string would then flow into a stack
        // trace or an operator's console. The error CODE alone is safe and
        // keeps a misconfiguration debuggable.
        const code = (err && err.code) || 'unknown';
        throw new Error(`mailer: smtp send failed (${code})`);
      }

      const messageId = (info && info.messageId) || newMessageId();
      return recordSend({ provider: 'smtp', messageId, sink });
    },
  };
}

// Parse a `MAIL_FROM` string into the { name, email } shape a JSON email API
// wants. Accepts both "Display Name <addr@host>" and a bare "addr@host".
function parseFromAddress(str) {
  const s = String(str || '').trim();
  const m = s.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  if (m) {
    const name = m[1].trim();
    return name ? { name, email: m[2].trim() } : { email: m[2].trim() };
  }
  return { email: s };
}

// The Brevo (HTTP API) provider. Sends over HTTPS (port 443) via Brevo's
// transactional email API instead of SMTP. This exists because many PaaS hosts
// (Render included) BLOCK outbound SMTP ports — a send then hangs for the full
// socket timeout and fails, with nothing ever reaching the provider. Port 443
// is never blocked, so the API path works where smtp cannot connect.
//
// Config: MAIL_API_KEY holds the Brevo API key (v3 key, starts `xkeysib-`);
// MAIL_FROM is the verified sender. `fetchImpl` is injectable so tests need no
// network. Records METADATA ONLY (guardrail #2) and, like the smtp provider,
// never lets the recipient address escape into an error message — a failure is
// re-thrown as a status/code only.
function createBrevoProvider({ sink, fetchImpl, apiKey, from, endpoint } = {}) {
  const key = apiKey !== undefined ? apiKey : config.mailApiKey;
  const fromStr = from !== undefined ? from : config.mailFrom;
  const url = endpoint || 'https://api.brevo.com/v3/smtp/email';

  // Fail closed at construction rather than silently not sending a campaign.
  if (!key) {
    throw new Error('mailer: MAIL_API_KEY is required for the brevo provider');
  }

  const doFetch = fetchImpl || (typeof fetch === 'function' ? fetch : null);
  if (!doFetch) {
    throw new Error('mailer: no fetch available for the brevo provider (Node >= 18)');
  }

  const sender = parseFromAddress(fromStr);

  return {
    name: 'brevo',
    async send(message) {
      if (!message || !message.to) {
        throw new Error('mailer: `to` is required');
      }

      let res;
      try {
        res = await doFetch(url, {
          method: 'POST',
          headers: {
            'api-key': key,
            'content-type': 'application/json',
            accept: 'application/json',
          },
          body: JSON.stringify({
            sender,
            to: [{ email: message.to }],
            subject: message.subject,
            htmlContent: message.html,
            textContent: message.text,
          }),
        });
      } catch (err) {
        // Network/DNS/timeout error. Never surface the raw message (belt and
        // braces — a fetch error should not carry the recipient, but we keep
        // the same code-only discipline as the smtp provider).
        const code = (err && err.code) || 'network_error';
        throw new Error(`mailer: brevo send failed (${code})`);
      }

      if (!res || !res.ok) {
        // Brevo echoes the offending address in its JSON error body, so the
        // body must NEVER be read into the thrown message. The HTTP status
        // alone keeps a misconfiguration debuggable (401 = bad key, 400 = bad
        // sender/payload) without leaking PII.
        const status = res ? res.status : 'no_response';
        throw new Error(`mailer: brevo send failed (http_${status})`);
      }

      // Success — pull the provider message id if present, else synthesize one.
      let messageId = newMessageId();
      try {
        const data = await res.json();
        if (data && data.messageId) messageId = String(data.messageId);
      } catch (_err) {
        // A 2xx with an unparseable body is still an accepted send.
      }
      return recordSend({ provider: 'brevo', messageId, sink });
    },
  };
}

// Provider registry. Real providers register here; an unknown provider name
// fails LOUDLY rather than silently no-op'ing a real campaign (fail closed —
// better a visible config error than a silent non-send).
const PROVIDERS = {
  console: createConsoleProvider,
  smtp: createSmtpProvider,
  brevo: createBrevoProvider,
};

function createMailer({ provider = config.mailProvider, ...opts } = {}) {
  const factory = PROVIDERS[provider];
  if (!factory) {
    throw new Error(
      `mailer: unknown provider '${provider}'. Configure MAIL_PROVIDER or register it in services/mailer.js`
    );
  }
  return factory(opts);
}

module.exports = {
  createMailer,
  createConsoleProvider,
  createSmtpProvider,
  createBrevoProvider,
  parseFromAddress,
  PROVIDERS,
};
