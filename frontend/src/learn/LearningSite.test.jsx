import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import LearningSite, { slugFromHash } from './LearningSite.jsx';

// Route helper for fetch: dispatch by URL to a canned JSON response.
function mockFetchRoutes(routes) {
  return vi.fn((url) => {
    for (const [pattern, response] of routes) {
      if (url.includes(pattern)) {
        return Promise.resolve({
          ok: response.ok !== false,
          status: response.status || 200,
          json: () => Promise.resolve(response.body),
        });
      }
    }
    return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({ error: 'not_found' }) });
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('slugFromHash', () => {
  it('returns null for the library index', () => {
    expect(slugFromHash('#/learn')).toBeNull();
  });
  it('extracts the slug for a module route', () => {
    expect(slugFromHash('#/learn/what-is-phishing')).toBe('what-is-phishing');
  });
  it('decodes an encoded slug', () => {
    expect(slugFromHash('#/learn/a%2Fb')).toBe('a/b');
  });
});

describe('LearningSite — library view', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      mockFetchRoutes([
        [
          '/api/learn/library',
          {
            body: {
              data: [
                {
                  category: 'phishing',
                  modules: [
                    { slug: 'recognizing-phishing', title: 'Recognizing Phishing', summary: 'The signs.' },
                  ],
                },
              ],
            },
          },
        ],
      ])
    );
  });

  it('renders the resource library grouped by category', async () => {
    render(<LearningSite hash="#/learn" />);
    expect(screen.getByRole('heading', { name: /cybersecurity awareness training/i })).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('link', { name: /Recognizing Phishing/i })).toBeInTheDocument()
    );
    // Category slug is humanized into a heading label.
    expect(screen.getByRole('heading', { name: 'Phishing' })).toBeInTheDocument();
    // The module link points at the module hash route.
    expect(screen.getByRole('link', { name: /Recognizing Phishing/i })).toHaveAttribute(
      'href',
      '#/learn/recognizing-phishing'
    );
  });
});

describe('LearningSite — module view', () => {
  it('renders a fetched module body as markdown', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetchRoutes([
        [
          '/api/learn/modules/what-is-phishing',
          {
            body: {
              data: {
                slug: 'what-is-phishing',
                title: 'What Phishing Is',
                body_markdown: '# What Phishing Is\n\nBe **careful**.',
              },
            },
          },
        ],
      ])
    );

    render(<LearningSite hash="#/learn/what-is-phishing" />);
    await waitFor(() => expect(screen.getByTestId('module')).toBeInTheDocument());
    expect(screen.getByRole('heading', { name: 'What Phishing Is' })).toBeInTheDocument();
    expect(screen.getByTestId('module').querySelector('strong')).toHaveTextContent('careful');
    // Back link to the library is present.
    expect(screen.getByRole('link', { name: /back to the resource library/i })).toHaveAttribute(
      'href',
      '#/learn'
    );
  });

  it('shows a not-found message for an unknown/unpublished slug', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetchRoutes([
        ['/api/learn/modules/missing', { ok: false, status: 404, body: { error: 'module_not_found' } }],
      ])
    );

    render(<LearningSite hash="#/learn/missing" />);
    await waitFor(() => expect(screen.getByTestId('module-error')).toBeInTheDocument());
    expect(screen.getByTestId('module-error')).toHaveTextContent(/could not be found/i);
  });
});
