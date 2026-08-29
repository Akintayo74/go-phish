'use strict';

// Small HTTP helpers shared by the route modules.
//
// `HttpError` carries the `status` + `publicMessage` fields the centralized
// error handler in app.js already reads, so throwing one from any (sync or
// async) handler produces a clean JSON error without leaking internals or the
// request body. `asyncHandler` forwards rejected promises to that handler so
// route code can stay `async` without a try/catch in every function.

class HttpError extends Error {
  constructor(status, publicMessage) {
    super(publicMessage);
    this.status = status;
    this.publicMessage = publicMessage;
  }
}

function badRequest(publicMessage) {
  return new HttpError(400, publicMessage);
}

function notFound(publicMessage = 'not_found') {
  return new HttpError(404, publicMessage);
}

function asyncHandler(fn) {
  return function wrapped(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = { HttpError, badRequest, notFound, asyncHandler };
