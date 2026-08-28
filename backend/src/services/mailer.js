'use strict';

// Email provider abstraction (Phase 5).
//
// Delivery depends only on the small `send({ to, subject, html, text })`
// contract below, so the real transactional provider (SendGrid / Mailgun / SES)
// can be swapped in without touching delivery logic. The default `console`
// provider is HERMETIC — it dispatches nothing over the network and is what
// tests and CI run against.
//
// GUARDRAIL #2 (bodies/PII never logged): the console provider records only
// non-sensitive metadata (a synthetic message id + status). It NEVER writes the
// recipient address, subject, or body to a log sink. `mailApiKey` is likewise
// never logged. Keep it that way — this transport doubles as the audit surface
// that proves a simulated send leaks nothing.

const crypto = require('crypto');
const config = require('../config');

function newMessageId() {
  return `sim-${crypto.randomBytes(9).toString('hex')}`;
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
      const messageId = newMessageId();
      // Metadata only. The recipient and body are deliberately absent.
      const record = { provider: 'console', messageId, status: 'accepted' };
      if (typeof sink === 'function') {
        sink(record);
      } else {
        // eslint-disable-next-line no-console
        console.log(`[mail] provider=console status=accepted id=${messageId}`);
      }
      return { messageId, provider: 'console', status: 'accepted' };
    },
  };
}

// Provider registry. Real providers register here; until one is wired, an
// unknown provider name fails LOUDLY rather than silently no-op'ing a real
// campaign (fail closed — better a visible config error than a silent non-send).
const PROVIDERS = {
  console: createConsoleProvider,
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

module.exports = { createMailer, createConsoleProvider, PROVIDERS };
