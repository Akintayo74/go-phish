'use strict';

// Server entrypoint. Boots the Express app and listens on the configured port.

const { createApp } = require('./app');
const config = require('./config');

const app = createApp();

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
