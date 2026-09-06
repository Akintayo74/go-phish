'use strict';

// Server entrypoint. Boots the Express app and listens on the configured port.

const { createApp } = require('./app');
const { createMailer } = require('./services/mailer');
const config = require('./config');

const app = createApp();

// Startup mail-provider diagnostic. The configured provider is built here so a
// misconfiguration is VISIBLE in the boot logs on every deploy — instead of
// surfacing only as an opaque 500 on the first /send (createMailer() throws
// inside the send path, and providers fail CLOSED without their required env
// vars). This construction is side-effect-free: no network, no SMTP connection
// (the smtp transport is built lazily on first send). It logs the provider name
// and, on failure, the provider's own safe message (e.g. "MAILGUN_DOMAIN is
// required for the mailgun provider") — NEVER a secret value or a recipient.
try {
  createMailer();
  // eslint-disable-next-line no-console
  console.log(
    `[cat-sim] mail provider '${config.mailProvider}' configured and ready`
  );
} catch (err) {
  // eslint-disable-next-line no-console
  console.error(
    `[cat-sim] mail provider '${config.mailProvider}' NOT READY: ${err.message}`
  );
}

const server = app.listen(config.port, () => {
  // eslint-disable-next-line no-console
  console.log(
    `[cat-sim] backend listening on :${config.port} (env=${config.env})`
  );
});

// Graceful shutdown so campaigns/jobs (added later) can stop cleanly.
function shutdown(signal) {
  // eslint-disable-next-line no-console
  console.log(`[cat-sim] received ${signal}, shutting down`);
  server.close(() => process.exit(0));
}

['SIGINT', 'SIGTERM'].forEach((sig) => process.on(sig, () => shutdown(sig)));

module.exports = server;
