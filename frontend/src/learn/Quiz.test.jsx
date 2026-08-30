import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import Quiz from './Quiz.jsx';

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
    return Promise.resolve({
      ok: false,
      status: 404,
      json: () => Promise.resolve({ error: 'quiz_not_found' }),
    });
  });
}

const PUBLIC_QUIZ = {
  data: {
    id: 'q1',
    title: 'Knowledge Check',
    pass_threshold: 70,
    questions: [
      { prompt: 'First question?', choices: ['A', 'B', 'C'] },
      { prompt: 'Second question?', choices: ['X', 'Y'] },
    ],
  },
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Quiz', () => {
  it('renders the quiz questions and choices, with no answer key in the payload', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetchRoutes([['/api/learn/modules/m/quiz', 'GET', { body: PUBLIC_QUIZ }]])
    );

    render(<Quiz slug="m" />);
    await waitFor(() => expect(screen.getByTestId('quiz')).toBeInTheDocument());

    expect(screen.getByRole('heading', { name: 'Knowledge Check' })).toBeInTheDocument();
    expect(screen.getAllByTestId('quiz-question')).toHaveLength(2);
    // The fetched quiz object carries no answer_index anywhere.
    expect(JSON.stringify(PUBLIC_QUIZ)).not.toMatch(/answer_index/);
  });

  it('renders nothing when the module has no quiz (404)', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetchRoutes([
        ['/api/learn/modules/m/quiz', 'GET', { ok: false, status: 404, body: { error: 'quiz_not_found' } }],
      ])
    );

    const { container } = render(<Quiz slug="m" />);
    // Give the effect a tick; nothing should render.
    await waitFor(() => expect(container.querySelector('[data-testid="quiz"]')).toBeNull());
    expect(screen.queryByTestId('quiz')).toBeNull();
  });

  it('disables submit until every question is answered', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetchRoutes([['/api/learn/modules/m/quiz', 'GET', { body: PUBLIC_QUIZ }]])
    );

    render(<Quiz slug="m" />);
    await waitFor(() => expect(screen.getByTestId('quiz')).toBeInTheDocument());

    const submit = screen.getByRole('button', { name: /check my answers/i });
    expect(submit).toBeDisabled();
    expect(screen.getByTestId('quiz-hint')).toBeInTheDocument();

    // Answer only the first question — still disabled.
    fireEvent.click(screen.getAllByRole('radio')[0]);
    expect(submit).toBeDisabled();
  });

  it('submits answers and shows the server-scored result', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetchRoutes([
        ['/api/learn/modules/m/quiz/attempt', 'POST', {
          body: { data: { total: 2, correct: 2, score: 100, passed: true, pass_threshold: 70 } },
        }],
        ['/api/learn/modules/m/quiz', 'GET', { body: PUBLIC_QUIZ }],
      ])
    );

    render(<Quiz slug="m" />);
    await waitFor(() => expect(screen.getByTestId('quiz')).toBeInTheDocument());

    // Answer both questions (first choice of each).
    const radios = screen.getAllByRole('radio');
    fireEvent.click(radios[0]); // q1 choice 0
    fireEvent.click(radios[3]); // q2 choice 0 (q1 has 3 choices, so index 3)

    const submit = screen.getByRole('button', { name: /check my answers/i });
    expect(submit).toBeEnabled();
    fireEvent.click(submit);

    await waitFor(() => expect(screen.getByTestId('quiz-result')).toBeInTheDocument());
    expect(screen.getByTestId('quiz-score')).toHaveTextContent('100%');
    expect(screen.getByText(/passed/i)).toBeInTheDocument();
  });

  it('posts the chosen choice indices, not any answer key, and grades on the server', async () => {
    const fetchMock = mockFetchRoutes([
      ['/api/learn/modules/m/quiz/attempt', 'POST', {
        body: { data: { total: 2, correct: 1, score: 50, passed: false, pass_threshold: 70 } },
      }],
      ['/api/learn/modules/m/quiz', 'GET', { body: PUBLIC_QUIZ }],
    ]);
    vi.stubGlobal('fetch', fetchMock);

    render(<Quiz slug="m" />);
    await waitFor(() => expect(screen.getByTestId('quiz')).toBeInTheDocument());

    const radios = screen.getAllByRole('radio');
    fireEvent.click(radios[1]); // q1 choice 1
    fireEvent.click(radios[3]); // q2 choice 0
    fireEvent.click(screen.getByRole('button', { name: /check my answers/i }));

    await waitFor(() => expect(screen.getByTestId('quiz-result')).toBeInTheDocument());

    // The POST body carried the selected choice indices as a dense array.
    const postCall = fetchMock.mock.calls.find(
      ([url, opts]) => url.includes('/attempt') && opts && opts.method === 'POST'
    );
    expect(postCall).toBeTruthy();
    const sent = JSON.parse(postCall[1].body);
    expect(sent).toEqual({ answers: [1, 0] });
    // Failing score surfaces the pass threshold.
    expect(screen.getByText(/need 70% to pass/i)).toBeInTheDocument();
  });
});
