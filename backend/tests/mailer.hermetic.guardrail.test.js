'use strict';

// NAMED GUARDRAIL TEST — the test suite can never send real email.
//
// Every provider except `console` dispatches over the network. `config.mailProvider`
// reads MAIL_PROVIDER from the environment, and a developer running the loop
// locally (or a CI box with deployment config present) will have a real transport
// configured in backend/.env. Without this guard, `npm test` resolves that
// transport and the suite's own fixture sends — system.loop.integration and
// system.credential.audit both drive a full campaign send — go out over the wire
// to addresses like `olu@corp.test`.
//
// That is a live outbound phishing-simulation send triggered by running the tests.
// NODE_ENV=test therefore pins the console transport regardless of MAIL_PROVIDER.
// Do not weaken or delete.

describe('the test environment is hermetic w.r.t. email', () => {
  const withEnv = (env, fn) => {
    const saved = {};
    for (const k of Object.keys(env)) {
      saved[k] = process.env[k];
      process.env[k] = env[k];
    }
    try {
      let cfg;
      jest.isolateModules(() => {
        cfg = require('../src/config');
      });
      fn(cfg);
    } finally {
      for (const k of Object.keys(saved)) {
        if (saved[k] === undefined) delete process.env[k];
        else process.env[k] = saved[k];
      }
    }
  };

  test('NODE_ENV=test forces the console provider even when MAIL_PROVIDER=smtp', () => {
    withEnv({ NODE_ENV: 'test', MAIL_PROVIDER: 'smtp', SMTP_HOST: 'smtp.real-relay.test' }, (cfg) => {
      expect(cfg.mailProvider).toBe('console');
    });
  });

  test('the suite it protects is itself running under NODE_ENV=test', () => {
    // If this ever fails, the guard above silently stops applying.
    expect(process.env.NODE_ENV).toBe('test');
    const config = require('../src/config');
    expect(config.isTest).toBe(true);
    expect(config.mailProvider).toBe('console');
  });

  test('the default mailer built during a test run is the no-op transport', () => {
    const { createMailer } = require('../src/services/mailer');
    expect(createMailer().name).toBe('console');
  });

  test('a non-test environment still honours MAIL_PROVIDER', () => {
    withEnv({ NODE_ENV: 'production', MAIL_PROVIDER: 'smtp' }, (cfg) => {
      expect(cfg.mailProvider).toBe('smtp');
    });
  });
});
