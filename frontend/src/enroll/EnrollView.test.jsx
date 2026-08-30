import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import EnrollView, { tokenFromHash } from './EnrollView.jsx';

// Dispatch fetch by URL + method to a canned JSON response.
function mockFetchRoutes(routes) {
  return vi.fn((url, options) => {
    const method = (options && options.method) || 'GET';
    for (const [pattern, mth, response] of routes) {
      if (url.includes(pattern) && mth === method) {
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

const TOKEN = 'ctok123';
const HASH = `#/enroll/${TOKEN}`;

const ASSIGNMENT = {
  data: {
    assignment: { status: 'in_progress', assigned_reason: 'submitted_form' },
    module: { slug: 'recognizing-phishing', title: 'Recognize Phishing', summary: 'Spot it.' },
    resimulate_after: null,
  },
};

const MODULE = { data: { slug: 'recognizing-phishing', body_markdown: '# Lesson\n\nRead this.' } };

const PUBLIC_QUIZ = {
  data: {
    id: 'q1',
    title: 'Knowledge Check',
    pass_threshold: 70,
    questions: [{ prompt: 'Q1?', choices: ['A', 'B'] }],
  },
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('tokenFromHash', () => {
  it('extracts the token, or null when absent', () => {
    expect(tokenFromHash('#/enroll/abc')).toBe('abc');
    expect(tokenFromHash('#/enroll/a%2Fb')).toBe('a/b');
    expect(tokenFromHash('#/learn')).toBeNull();
    expect(tokenFromHash('')).toBeNull();
  });
});

describe('EnrollView', () => {
  it('renders the assigned module and a supportive, non-punitive intro', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetchRoutes([
        [`/api/enroll/${TOKEN}`, 'GET', { body: ASSIGNMENT }],
        ['/api/learn/modules/recognizing-phishing/quiz', 'GET', { body: PUBLIC_QUIZ }],
        ['/api/learn/modules/recognizing-phishing', 'GET', { body: MODULE }],
      ])
    );

    render(<EnrollView hash={HASH} />);

    await waitFor(() => expect(screen.getByTestId('enroll-intro')).toBeInTheDocument());
    expect(screen.getByRole('heading', { name: 'Recognize Phishing' })).toBeInTheDocument();
    expect(screen.getByTestId('enroll-intro')).toHaveTextContent(/nothing you typed was captured/i);
    await waitFor(() => expect(screen.getByTestId('lesson')).toBeInTheDocument());
  });

  it('shows an error for an invalid training link', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetchRoutes([
        [`/api/enroll/${TOKEN}`, 'GET', { ok: false, status: 404, body: { error: 'assignment_not_found' } }],
      ])
    );

    render(<EnrollView hash={HASH} />);
    await waitFor(() => expect(screen.getByTestId('enroll-error')).toBeInTheDocument());
    expect(screen.getByTestId('enroll-error')).toHaveTextContent(/not valid/i);
  });

  it('completes the assignment when the knowledge check is passed (scored server-side)', async () => {
    const fetchMock = mockFetchRoutes([
      [`/api/enroll/${TOKEN}/quiz/attempt`, 'POST', {
        body: { data: { total: 1, correct: 1, score: 100, passed: true, pass_threshold: 70, assignment_status: 'completed' } },
      }],
      [`/api/enroll/${TOKEN}`, 'GET', { body: ASSIGNMENT }],
      ['/api/learn/modules/recognizing-phishing/quiz', 'GET', { body: PUBLIC_QUIZ }],
      ['/api/learn/modules/recognizing-phishing', 'GET', { body: MODULE }],
    ]);
    vi.stubGlobal('fetch', fetchMock);

    render(<EnrollView hash={HASH} />);
    await waitFor(() => expect(screen.getByTestId('quiz')).toBeInTheDocument());

    fireEvent.click(screen.getAllByRole('radio')[0]);
    fireEvent.click(screen.getByRole('button', { name: /check my answers/i }));

    await waitFor(() => expect(screen.getByTestId('enroll-complete')).toBeInTheDocument());

    // The attempt POST went to the tokened enroll endpoint (which records
    // completion), not the anonymous public learn endpoint.
    const postCall = fetchMock.mock.calls.find(
      ([url, opts]) => opts && opts.method === 'POST'
    );
    expect(postCall[0]).toContain(`/api/enroll/${TOKEN}/quiz/attempt`);
  });
});
