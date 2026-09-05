import React, { useEffect, useState } from 'react';
import { learnApi } from './api.js';
import { color, radius, type, tabular } from '../ui/theme.js';
import { Button } from '../ui/primitives.jsx';

// Phase 7 — knowledge-check quiz for a lesson module (screen 2e). Rendered
// beneath the module body on #/learn/<slug>. Fully public, like the rest of the
// CAT site.
//
// The answer key never reaches this component: the API returns prompts + choices
// only, and grading is done server-side. On submit we POST the chosen choice
// indices and render the aggregate result (score + pass/fail) the server sends
// back — this component never decides correctness itself.
//
// Options are REAL radio inputs (visually hidden), not styled divs, so keyboard
// and screen-reader behaviour is correct; the visible treatment is on the
// wrapping label.

function ResultBanner({ result, onRetry }) {
  return (
    <div data-testid="quiz-result" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <p style={{ ...type.body, color: color.textBody, margin: 0 }}>
        <strong style={{ fontWeight: 500 }}>{result.passed ? 'Passed' : 'Keep practicing'}</strong> — you scored{' '}
        <span data-testid="quiz-score" data-tabular style={tabular}>{result.score}%</span> ({result.correct} of {result.total}{' '}
        correct). {result.passed ? '' : `You need ${result.pass_threshold}% to pass.`}
      </p>
      <Button type="button" variant={result.passed ? 'secondary' : 'primary'} onClick={onRetry}>
        {result.passed ? 'Take it again' : 'Try again'}
      </Button>
    </div>
  );
}

// A single option rendered as a real (visually hidden) radio inside its label.
function Option({ name, checked, onChange, children }) {
  return (
    <label
      className="cs-press-lg"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        minHeight: 44,
        padding: '12px 14px',
        borderRadius: radius.option,
        fontSize: 15,
        lineHeight: 1.4,
        cursor: 'pointer',
        background: checked ? color.accentWash : color.surface,
        border: checked ? `1.5px solid ${color.accent}` : `1px solid ${color.border}`,
        fontWeight: checked ? 500 : 400,
        color: color.textBody,
        transition: 'background-color 160ms ease, border-color 160ms ease',
      }}
    >
      {/* visually hidden but real, focusable, and keyboard-operable */}
      <input
        type="radio"
        name={name}
        checked={checked}
        onChange={onChange}
        style={{ position: 'absolute', opacity: 0, width: 1, height: 1, margin: 0 }}
      />
      <span
        aria-hidden="true"
        style={{
          width: 18,
          height: 18,
          borderRadius: 999,
          flex: 'none',
          boxSizing: 'border-box',
          border: checked ? `5px solid ${color.accent}` : `1.5px solid ${color.borderStrong}`,
          background: 'transparent',
        }}
      />
      <span>{children}</span>
    </label>
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
        <p style={{ color: color.textSecondary }}>The knowledge check is currently unavailable.</p>
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
    <section
      data-testid="quiz"
      aria-labelledby="quiz-heading"
      style={{
        background: color.surfaceRaised,
        border: `1px solid ${color.border}`,
        borderRadius: radius.card,
        padding: '18px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
      }}
    >
      <h3 id="quiz-heading" style={{ ...type.sectionH2, color: color.ink, margin: 0 }}>
        {quiz.title || 'Knowledge check'}
      </h3>

      {result ? (
        <ResultBanner result={result} onRetry={retry} />
      ) : (
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {quiz.questions.map((q, qi) => (
            <fieldset key={qi} data-testid="quiz-question" style={{ border: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <legend style={{ ...type.body, color: color.textBody, padding: 0, marginBottom: 2 }}>{q.prompt}</legend>
              {q.choices.map((choice, ci) => (
                <Option key={ci} name={`q${qi}`} checked={answers[qi] === ci} onChange={() => choose(qi, ci)}>
                  {choice}
                </Option>
              ))}
            </fieldset>
          ))}

          <Button type="submit" variant="primary" full disabled={submitting || !allAnswered}>
            {submitting ? 'Scoring…' : 'Check my answers'}
          </Button>
          {!allAnswered && (
            <p data-testid="quiz-hint" style={{ fontSize: 13, color: color.textMuted, margin: 0 }}>
              Answer all {total} question{total === 1 ? '' : 's'} to check your score.
            </p>
          )}
        </form>
      )}
    </section>
  );
}
