'use strict';

// Unit tests for the tracking-token generator (Phase 5). A token is an opaque
// routing identifier: it must be url-safe (drops into a path with no escaping),
// high-entropy, and effectively never collide.

const { generateToken, DEFAULT_BYTES } = require('../src/lib/token');

describe('generateToken', () => {
  test('is url-safe (base64url alphabet only)', () => {
    for (let i = 0; i < 50; i += 1) {
      expect(generateToken()).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });

  test('encodes the requested entropy (32 bytes by default)', () => {
    expect(DEFAULT_BYTES).toBe(32);
    // 32 bytes → 43 base64url chars (unpadded).
    expect(generateToken()).toHaveLength(43);
  });

  test('does not collide across many draws', () => {
    const seen = new Set();
    for (let i = 0; i < 10000; i += 1) seen.add(generateToken());
    expect(seen.size).toBe(10000);
  });
});
