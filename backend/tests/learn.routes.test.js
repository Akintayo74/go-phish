'use strict';

// Public CAT learning-site API contract (Phase 6). Repositories are mocked so
// the routes are tested without a database. These endpoints are PUBLIC — no
// auth header is sent, and the routes must never require one.

jest.mock('../src/repositories', () => ({
  learningModules: {
    listPublished: jest.fn(),
    findPublishedBySlug: jest.fn(),
  },
}));

const request = require('supertest');
const { createApp } = require('../src/app');
const { learningModules } = require('../src/repositories');

function app() {
  return createApp({ logger: () => {} });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('GET /api/learn/modules', () => {
  test('is public (no auth) and lists published modules', async () => {
    const rows = [
      { slug: 'what-is-phishing', title: 'What Phishing Is', category: 'fundamentals' },
      { slug: 'recognizing-phishing', title: 'Recognizing Phishing', category: 'phishing' },
    ];
    learningModules.listPublished.mockResolvedValue(rows);

    const res = await request(app()).get('/api/learn/modules').expect(200);

    expect(res.body).toEqual({ data: rows });
    // No category filter passed.
    expect(learningModules.listPublished).toHaveBeenCalledWith({ category: undefined });
  });

  test('passes ?category= through to the published-only accessor', async () => {
    learningModules.listPublished.mockResolvedValue([]);
    await request(app()).get('/api/learn/modules?category=phishing').expect(200);
    expect(learningModules.listPublished).toHaveBeenCalledWith({ category: 'phishing' });
  });
});

describe('GET /api/learn/modules/:slug', () => {
  test('returns one published module with its body', async () => {
    const module = {
      slug: 'what-is-phishing',
      title: 'What Phishing Is',
      body_markdown: '# What Phishing Is\n\nBody.',
      published: true,
    };
    learningModules.findPublishedBySlug.mockResolvedValue(module);

    const res = await request(app()).get('/api/learn/modules/what-is-phishing').expect(200);

    expect(res.body).toEqual({ data: module });
    expect(learningModules.findPublishedBySlug).toHaveBeenCalledWith('what-is-phishing');
  });

  test('an unknown OR unpublished slug is an indistinguishable 404', async () => {
    // The published-only accessor returns undefined for both cases, so a draft
    // never leaks — the route cannot tell "missing" from "draft" apart.
    learningModules.findPublishedBySlug.mockResolvedValue(undefined);
    const res = await request(app()).get('/api/learn/modules/draft-advanced-threats').expect(404);
    expect(res.body).toEqual({ error: 'module_not_found' });
  });
});

describe('GET /api/learn/library', () => {
  test('groups published modules by category in order', async () => {
    learningModules.listPublished.mockResolvedValue([
      { slug: 'what-is-phishing', title: 'What Phishing Is', category: 'fundamentals' },
      { slug: 'protecting-your-accounts', title: 'Protecting Your Accounts', category: 'fundamentals' },
      { slug: 'recognizing-phishing', title: 'Recognizing Phishing', category: 'phishing' },
    ]);

    const res = await request(app()).get('/api/learn/library').expect(200);

    expect(res.body.data).toEqual([
      {
        category: 'fundamentals',
        modules: [
          { slug: 'what-is-phishing', title: 'What Phishing Is', category: 'fundamentals' },
          { slug: 'protecting-your-accounts', title: 'Protecting Your Accounts', category: 'fundamentals' },
        ],
      },
      {
        category: 'phishing',
        modules: [{ slug: 'recognizing-phishing', title: 'Recognizing Phishing', category: 'phishing' }],
      },
    ]);
  });

  test('a module with no category falls under a stable "general" bucket', async () => {
    learningModules.listPublished.mockResolvedValue([
      { slug: 'loose', title: 'Loose Module', category: null },
    ]);
    const res = await request(app()).get('/api/learn/library').expect(200);
    expect(res.body.data).toEqual([
      { category: 'general', modules: [{ slug: 'loose', title: 'Loose Module', category: null }] },
    ]);
  });
});
