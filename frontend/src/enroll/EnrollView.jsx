import React, { useEffect, useState } from 'react';
import { enrollApi } from './api.js';
import { learnApi } from '../learn/api.js';
import { Markdown } from '../learn/markdown.jsx';
import Quiz from '../learn/Quiz.jsx';
import { color, radius, type } from '../ui/theme.js';
import { Page, Wordmark, Note } from '../ui/primitives.jsx';

// Phase 8 — the participant's training landing, reached from the enrollment
// email at #/enroll/<token>. It loads THEIR assignment by the opaque token,
// renders the assigned lesson, and presents the knowledge check. Passing the
// quiz marks the assignment completed on the server (scoring is server-side —
// the answer key never reaches the browser).
//
// The tone is supportive and non-punitive by design (guardrail/PRD ethics):
// this is a short lesson, not a reprimand. Styled to the "Civic" design system,
// and it shares the disclosure page's job of relief — the reassurance ("nothing
// you typed was captured") leads.
//
// It renders a full lesson, so it sits in the `prose` shell: one column held at
// a reading measure on any screen. It gets no lesson rail — this is the one
// lesson this person was assigned, not a library to browse.

// Extract the token from a `#/enroll/<token>` hash.
export function tokenFromHash(hash) {
  const m = /^#\/enroll\/([^/?#]+)/.exec(hash || '');
  return m ? decodeURIComponent(m[1]) : null;
}

function LessonBody({ slug }) {
  const [state, setState] = useState({ status: 'loading', body: null });

  useEffect(() => {
    let active = true;
    setState({ status: 'loading', body: null });
    learnApi
      .module(slug)
      .then((res) => active && setState({ status: 'ready', body: res.data.body_markdown }))
      .catch(() => active && setState({ status: 'error', body: null }));
    return () => {
      active = false;
    };
  }, [slug]);

  if (state.status === 'loading') return <p data-testid="lesson-loading" style={{ color: color.textMuted }}>Loading your lesson…</p>;
  if (state.status === 'error') {
    return <p data-testid="lesson-error" style={{ color: color.textSecondary }}>The lesson content is currently unavailable.</p>;
  }
  return (
    <article data-testid="lesson" className="cs-prose">
      <Markdown>{state.body}</Markdown>
    </article>
  );
}

export default function EnrollView({ hash }) {
  const token = tokenFromHash(hash);
  const [state, setState] = useState({ status: 'loading', data: null, error: null });
  const [completed, setCompleted] = useState(false);

  useEffect(() => {
    let active = true;
    setState({ status: 'loading', data: null, error: null });
    setCompleted(false);
    if (!token) {
      setState({ status: 'error', data: null, error: 'not_found' });
      return undefined;
    }
    enrollApi
      .assignment(token)
      .then((res) => {
        if (!active) return;
        setState({ status: 'ready', data: res.data, error: null });
        if (res.data.assignment && res.data.assignment.status === 'completed') {
          setCompleted(true);
        }
      })
      .catch(
        (err) =>
          active &&
          setState({
            status: 'error',
            data: null,
            error: err.code === 'assignment_not_found' ? 'not_found' : 'unreachable',
          })
      );
    return () => {
      active = false;
    };
  }, [token]);

  return (
    <Page background={color.surfaceRecessed} width="prose">
      <header>
        <Wordmark />
      </header>

      <section style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <h2 style={{ ...type.pageTitle, color: color.ink, margin: 0 }}>Your security awareness training</h2>

        {state.status === 'loading' && <p data-testid="enroll-loading" style={{ color: color.textMuted }}>Loading…</p>}

        {state.status === 'error' && state.error === 'not_found' && (
          <p data-testid="enroll-error" style={{ color: color.textSecondary }}>This training link is not valid.</p>
        )}
        {state.status === 'error' && state.error === 'unreachable' && (
          <p data-testid="enroll-error" style={{ color: color.textSecondary }}>
            Training is currently unavailable. Please try again later.
          </p>
        )}

        {state.status === 'ready' && state.data && (
          <>
            <Note data-testid="enroll-intro">
              You took part in a phishing simulation — this happens to careful people every day, and{' '}
              <strong style={{ fontWeight: 600 }}>nothing you typed was captured or stored</strong>. Here is a short
              lesson to help you spot the next one.
            </Note>

            {completed && (
              <div
                data-testid="enroll-complete"
                role="status"
                style={{
                  display: 'flex',
                  gap: 12,
                  alignItems: 'baseline',
                  background: '#e7f1ec',
                  borderRadius: radius.note,
                  padding: 16,
                  color: color.success,
                  fontSize: 14,
                  lineHeight: 1.6,
                }}
              >
                <strong style={{ fontWeight: 600 }}>Training complete.</strong> Thank you for finishing this lesson.
              </div>
            )}

            {state.data.module ? (
              <>
                <h3 style={{ ...type.lessonH1, color: color.ink, margin: 0 }}>{state.data.module.title}</h3>
                <LessonBody slug={state.data.module.slug} />
                <Quiz
                  slug={state.data.module.slug}
                  submitAnswers={(answers) => enrollApi.submitQuiz(token, answers)}
                  onResult={(result) => {
                    if (result && result.passed) setCompleted(true);
                  }}
                />
              </>
            ) : (
              <p data-testid="enroll-no-module" style={{ color: color.textSecondary }}>
                Your assigned lesson could not be loaded.
              </p>
            )}
          </>
        )}
      </section>
    </Page>
  );
}
