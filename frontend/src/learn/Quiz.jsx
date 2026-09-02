import React, { useEffect, useState } from 'react';
import { learnApi } from './api.js';

// Phase 7 — knowledge-check quiz for a lesson module. Rendered beneath the
// module body on #/learn/<slug>. Fully public, like the rest of the CAT site.
//
// The answer key never reaches this component: the API returns prompts + choices
// only, and grading is done server-side. On submit we POST the chosen choice
// indices and render the aggregate result (score + pass/fail) the server sends
// back — this component never decides correctness itself.

function ResultBanner({ result, onRetry }) {
  return (
    <div data-testid="quiz-result">
      <p>
        <strong>{result.passed ? 'Passed' : 'Keep practicing'}</strong> — you scored{' '}
        <span data-testid="quiz-score">{result.score}%</span> ({result.correct} of {result.total}{' '}
        correct). {result.passed ? '' : `You need ${result.pass_threshold}% to pass.`}
      </p>
      <button type="button" onClick={onRetry}>
        {result.passed ? 'Take it again' : 'Try again'}
      </button>
    </div>
  );
}

// Props:
//   slug          – the module whose (published, key-stripped) quiz to load.
//   submitAnswers – optional override for scoring the attempt, called with the
//                   dense answer array. Defaults to the public learn endpoint;
//                   the Phase 8 enroll view passes a variant that also records
//                   completion against the assignment token. Must resolve to the
//                   same `{ data: result }` shape.
//   onResult      – optional callback invoked with the scored result (used by
//                   the enroll view to reflect completion).
export default function Quiz({ slug, submitAnswers, onResult }) {
  const [quiz, setQuiz] = useState(null); // null until loaded; false = no quiz
  const [answers, setAnswers] = useState({}); // question index → chosen choice index
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    setQuiz(null);
    setAnswers({});
    setResult(null);
    setError(null);
    learnApi
      .quiz(slug)
      .then((res) => {
        if (!active) return;
        const data = res && res.data;
        // Guard against a payload that isn't actually a quiz (e.g. a module body
        // matched by a loose fetch mock): treat a missing/empty question set as
        // "this module has no quiz".
        if (data && Array.isArray(data.questions) && data.questions.length > 0) {
          setQuiz(data);
        } else {
          setQuiz(false);
        }
      })
      .catch((err) => {
        if (!active) return;
        // A module simply without a quiz → render nothing, not an error.
        if (err.code === 'quiz_not_found') setQuiz(false);
        else setError('unreachable');
      });
    return () => {
      active = false;
    };
  }, [slug]);

  if (error) {
    return (
      <section data-testid="quiz-error">
        <p>The knowledge check is currently unavailable.</p>
      </section>
    );
  }

  // Not loaded yet, or this module has no quiz.
  if (!quiz) return null;

  const total = quiz.questions.length;
  const allAnswered = quiz.questions.every((_, i) => Number.isInteger(answers[i]));

  const choose = (qi, ci) => {
    setAnswers((prev) => ({ ...prev, [qi]: ci }));
  };

  const submit = (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    // Build a dense array indexed by question position for the server.
    const payload = quiz.questions.map((_, i) =>
      Number.isInteger(answers[i]) ? answers[i] : null
    );
    const scorer = submitAnswers
      ? submitAnswers(payload)
      : learnApi.submitQuiz(slug, payload);
    Promise.resolve(scorer)
      .then((res) => {
        setResult(res.data);
        if (typeof onResult === 'function') onResult(res.data);
      })
      .catch(() => setError('unreachable'))
      .finally(() => setSubmitting(false));
  };

  const retry = () => {
    setResult(null);
    setAnswers({});
  };

  return (
    <section data-testid="quiz" aria-labelledby="quiz-heading">
      <h3 id="quiz-heading">{quiz.title || 'Knowledge check'}</h3>

      {result ? (
        <ResultBanner result={result} onRetry={retry} />
      ) : (
        <form onSubmit={submit}>
          {quiz.questions.map((q, qi) => (
            <fieldset key={qi} data-testid="quiz-question" style={{ marginBottom: '1rem' }}>
              <legend>{q.prompt}</legend>
              {q.choices.map((choice, ci) => (
                <label key={ci} style={{ display: 'block' }}>
                  <input
                    type="radio"
                    name={`q${qi}`}
                    checked={answers[qi] === ci}
                    onChange={() => choose(qi, ci)}
                  />{' '}
                  {choice}
                </label>
              ))}
            </fieldset>
          ))}

          <button type="submit" disabled={submitting || !allAnswered}>
            {submitting ? 'Scoring…' : 'Check my answers'}
          </button>
          {!allAnswered && (
            <p data-testid="quiz-hint">
              Answer all {total} question{total === 1 ? '' : 's'} to check your score.
            </p>
          )}
        </form>
      )}
    </section>
  );
}
