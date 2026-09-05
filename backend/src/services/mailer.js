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

// Provider registry. Real providers register here; an unknown provider name
// fails LOUDLY rather than silently no-op'ing a real campaign (fail closed —
// better a visible config error than a silent non-send).
const PROVIDERS = {
  console: createConsoleProvider,
  smtp: createSmtpProvider,
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

module.exports = { createMailer, createConsoleProvider, createSmtpProvider, PROVIDERS };
