'use strict';

// Request logger — GUARDRAIL-CRITICAL.
//
// CAT-Sim simulates credential-harvesting pages. Per the PRD and Dev Guide,
// NO request body may ever reach a log sink: not for the dummy form route,
// not anywhere. This logger records only non-sensitive request metadata
// (method, path, status, duration) and is deliberately built so there is no
// code path that serializes `req.body`, query strings, or headers into a log.
//
// The `sink` is injectable so tests can capture output and assert that a
// submitted (fake) credential never appears in it. See tests/logging.test.js.

const SAFE_FIELDS = ['method', 'path', 'status', 'durationMs'];

function createRequestLogger(sink = defaultSink) {
  return function requestLogger(req, res, next) {
    const startedAt = process.hrtime.bigint();

    res.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
      // Only ever construct a record from the allow-listed safe fields.
      // `req.body` / `req.query` / `req.headers` are intentionally NOT read.
      const record = {
        method: req.method,
        // req.path excludes the query string; use it (not req.originalUrl)
        // so tokens/values in query strings are never logged either.
        path: req.path,
        status: res.statusCode,
        durationMs: Math.round(durationMs * 1000) / 1000,
      };
      sink(record);
    });

    next();
  };
}

function defaultSink(record) {
  // One structured line per request, safe fields only.
  const line = SAFE_FIELDS.map((f) => `${f}=${record[f]}`).join(' ');
  // eslint-disable-next-line no-console
  console.log(`[req] ${line}`);
}

module.exports = { createRequestLogger, SAFE_FIELDS };
