import React, { useEffect, useState } from 'react';
import { learnApi } from './api.js';
import { Markdown } from './markdown.jsx';
import Quiz from './Quiz.jsx';
import { color, radius, type } from '../ui/theme.js';
import { Wordmark, QuietLink, Eyebrow } from '../ui/primitives.jsx';

// Public CAT learning site (Phase 6), styled to the "Civic" design system.
// Two views, selected by hash:
//   #/learn          → the resource library (screen 2d), modules grouped by category
//   #/learn/<slug>   → one lesson module (screen 2e), its markdown body rendered
//
// Fully public and read-only — no login, and nothing about who reads what is
// sent to the server beyond the plain content GET. Mobile-first (drawn at 390px):
// 44px minimum targets throughout.

// Turn a category slug ('local-tactics') into a display label ('Local Tactics').
function categoryLabel(slug) {
  return String(slug)
    .split('-')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

// Extract the module slug from a `#/learn/<slug>` hash, or null for the index.
export function slugFromHash(hash) {
  const m = /^#\/learn\/([^/?#]+)/.exec(hash || '');
  return m ? decodeURIComponent(m[1]) : null;
}

// The mobile screen frame shared by both learning views.
function Screen({ children }) {
  return (
    <div style={{ background: color.surface, minHeight: '100vh', display: 'flex', justifyContent: 'center' }}>
      <div style={{ width: '100%', maxWidth: 430, padding: '22px 20px 26px', display: 'flex', flexDirection: 'column', gap: 22 }}>
        {children}
      </div>
    </div>
  );
}

// A single lesson row (2d). `dark` inverts it to ink — used for the one lesson
// aimed at someone who has already clicked something and needs help now.
function LessonRow({ slug, title, subtitle, dark }) {
  return (
    <a
      href={`#/learn/${encodeURIComponent(slug)}`}
      className="cs-focusable cs-press-lg"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        minHeight: 44,
        padding: '15px 16px',
        borderRadius: radius.card - 2,
        border: `1px solid ${dark ? color.ink : color.border}`,
        background: dark ? color.ink : color.surfaceRaised,
        textDecoration: 'none',
        transition: 'border-color 160ms ease, transform 160ms cubic-bezier(0.23,1,0.32,1)',
      }}
    >
      <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontSize: 15, lineHeight: 1.3, fontWeight: 500, color: dark ? color.white : color.ink }}>
          {title}
        </span>
        {subtitle && (
          <span style={{ fontSize: 13, lineHeight: 1.4, color: dark ? color.textOnDarkMuted : color.textMuted }}>
            {subtitle}
          </span>
        )}
      </span>
      <span aria-hidden="true" style={{ color: dark ? color.textOnDarkMuted : color.textMuted, fontSize: 16 }}>→</span>
    </a>
  );
}

function ModuleView({ slug }) {
  const [state, setState] = useState({ status: 'loading', module: null, error: null });

  useEffect(() => {
    let active = true;
    setState({ status: 'loading', module: null, error: null });
    learnApi
      .module(slug)
      .then((res) => active && setState({ status: 'ready', module: res.data, error: null }))
      .catch(
        (err) =>
          active &&
          setState({
            status: 'error',
            module: null,
            error: err.code === 'module_not_found' ? 'not_found' : 'unreachable',
          })
      );
    return () => {
      active = false;
    };
  }, [slug]);

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <QuietLink href="#/learn" style={{ alignSelf: 'flex-start', paddingLeft: 0 }}>
        <span aria-hidden="true">←</span> Back to the resource library
      </QuietLink>

      {state.status === 'loading' && <p data-testid="module-loading" style={{ color: color.textMuted }}>Loading…</p>}

      {state.status === 'error' && state.error === 'not_found' && (
        <p data-testid="module-error" style={{ color: color.textSecondary }}>That lesson could not be found.</p>
      )}
      {state.status === 'error' && state.error === 'unreachable' && (
        <p data-testid="module-error" style={{ color: color.textSecondary }}>The learning content is currently unavailable.</p>
      )}

      {state.status === 'ready' && state.module && (
        <>
          <article data-testid="module" className="cs-prose">
            <Markdown>{state.module.body_markdown}</Markdown>
          </article>
          {/* The module's knowledge check (Phase 7). Renders nothing if the
              module has no quiz. */}
          <Quiz slug={slug} />
        </>
      )}
    </section>
  );
}

function LibraryView() {
  const [state, setState] = useState({ status: 'loading', groups: [], error: null });

  useEffect(() => {
    let active = true;
    learnApi
      .library()
      .then((res) => active && setState({ status: 'ready', groups: res.data || [], error: null }))
      .catch((err) => active && setState({ status: 'error', groups: [], error: err }));
    return () => {
      active = false;
    };
  }, []);

  const groups = state.groups;
  const lastGroupIndex = groups.length - 1;

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h2 style={{ ...type.pageTitle, color: color.ink, margin: 0 }}>Cybersecurity Awareness Training</h2>
        <p style={{ ...type.body, color: color.textMuted, margin: 0 }}>
          Five short lessons. Free, no account, and nothing about who reads what is recorded.
        </p>
      </div>

      {state.status === 'loading' && <p data-testid="library-loading" style={{ color: color.textMuted }}>Loading…</p>}

      {state.status === 'error' && (
        <p data-testid="library-error" style={{ color: color.textSecondary }}>The learning content is currently unavailable.</p>
      )}

      {state.status === 'ready' && groups.length === 0 && (
        <p data-testid="library-empty" style={{ color: color.textSecondary }}>No lessons are published yet.</p>
      )}

      {state.status === 'ready' &&
        groups.map((group, gi) => (
          <div key={group.category} data-testid="library-category" style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            <Eyebrow as="h3">{categoryLabel(group.category)}</Eyebrow>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              {group.modules.map((mod, mi) => (
                <LessonRow
                  key={mod.slug}
                  slug={mod.slug}
                  title={mod.title}
                  subtitle={mod.summary}
                  // The one dark row on the screen: the last lesson overall, the
                  // one for someone who has already clicked and needs help now.
                  dark={gi === lastGroupIndex && mi === group.modules.length - 1}
                />
              ))}
            </div>
          </div>
        ))}
    </section>
  );
}

export default function LearningSite({ hash }) {
  const slug = slugFromHash(hash);
  return (
    <Screen>
      <header>
        <Wordmark />
      </header>
      {slug ? <ModuleView slug={slug} /> : <LibraryView />}
    </Screen>
  );
}
