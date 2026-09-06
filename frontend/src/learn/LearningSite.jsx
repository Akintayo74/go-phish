import React, { useEffect, useState } from 'react';
import { learnApi } from './api.js';
import { Markdown } from './markdown.jsx';
import Quiz from './Quiz.jsx';
import { color, radius, type, measure } from '../ui/theme.js';
import { Page, Wordmark, QuietLink, Eyebrow } from '../ui/primitives.jsx';

// Public CAT learning site (Phase 6), styled to the "Civic" design system.
// Two views, selected by hash:
//   #/learn          → the resource library (screen 2d), modules grouped by category
//   #/learn/<slug>   → one lesson module (screen 2e), its markdown body rendered
//
// Fully public and read-only — no login, and nothing about who reads what is
// sent to the server beyond the plain content GET.
//
// The composition is the drawn 390px one up to 1024px. Above that it is a
// desktop layout rather than a stretched phone: the lesson view grows a sticky
// rail of every lesson in the library (`.cs-learn-body` in global.css), and the
// library index lays its rows out in columns. The text column itself never
// grows past a reading measure — see the `layout` note in ui/theme.js.

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

// The published library, grouped by category. Loaded once for the whole site:
// the index renders it as the page, and the lesson view renders it as the
// desktop rail. A failure is not surfaced on the lesson view — the rail simply
// does not appear, and the back link (which is always in the markup) carries on.
function useLibrary() {
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

  return state;
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

// The desktop lesson rail — every published lesson, with the one being read
// marked. Rendered only on a lesson route (on the index the page itself is
// already this list), and hidden below 1024px by `.cs-learn-rail`.
//
// The category labels are NOT headings: they would land above the lesson's own
// h1 in the document and invert the heading order. They label their list
// instead, which is what they actually do.
function LessonRail({ groups, activeSlug }) {
  if (!groups || groups.length === 0) return null;
  return (
    <nav className="cs-learn-rail" aria-label="All lessons">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* paddingLeft matches the rail items' 10px so the whole column has one
            left edge. */}
        <QuietLink href="#/learn" style={{ alignSelf: 'flex-start', paddingLeft: 10 }}>
          <span aria-hidden="true">←</span> All lessons
        </QuietLink>

        {groups.map((group) => {
          const labelId = `rail-${group.category}`;
          return (
            <div key={group.category} style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <Eyebrow id={labelId} style={{ paddingLeft: 10 }}>
                {categoryLabel(group.category)}
              </Eyebrow>
              <ul
                aria-labelledby={labelId}
                style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 1 }}
              >
                {group.modules.map((mod) => {
                  const active = mod.slug === activeSlug;
                  return (
                    <li key={mod.slug}>
                      <a
                        href={`#/learn/${encodeURIComponent(mod.slug)}`}
                        className="cs-focusable"
                        aria-current={active ? 'page' : undefined}
                        style={{
                          display: 'block',
                          padding: '8px 10px',
                          borderRadius: radius.nav,
                          fontSize: 13,
                          lineHeight: 1.45,
                          textDecoration: 'none',
                          fontWeight: active ? 500 : 400,
                          color: active ? color.ink : color.textSecondary,
                          background: active ? color.surfaceSunken : 'transparent',
                          transition: 'background-color 160ms ease, color 160ms ease',
                        }}
                      >
                        {mod.title}
                      </a>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    </nav>
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
      {/* Always in the markup — the rail replaces it only where the rail is
          actually shown (`.cs-learn-back` is hidden from 1024px up). The class
          goes on a wrapper because QuietLink sets `display` inline, and an
          inline style outranks a stylesheet rule. */}
      <span className="cs-learn-back">
        <QuietLink href="#/learn" style={{ paddingLeft: 0 }}>
          <span aria-hidden="true">←</span> Back to the resource library
        </QuietLink>
      </span>

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

function LibraryView({ state }) {
  const groups = state.groups;
  const lessonCount = groups.reduce((n, g) => n + g.modules.length, 0);

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 26 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h2 style={{ ...type.pageTitle, color: color.ink, margin: 0, maxWidth: '18ch' }}>
          Cybersecurity Awareness Training
        </h2>
        <p style={{ ...type.lead, ...measure, color: color.textMuted, margin: 0 }}>
          {lessonCount > 0 ? `${lessonCount} short lessons` : 'Short lessons'}, plus links out to
          free courses and official guidance. No account, and nothing about who reads what is
          recorded.
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
        groups.map((group) => (
          <div key={group.category} data-testid="library-category" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Eyebrow as="h3">{categoryLabel(group.category)}</Eyebrow>
            {/* auto-fill is the responsiveness here: one column in the drawn
                390px frame, up to three once the shell widens on a desktop. No
                breakpoint needed, so it stays an inline style. */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(288px, 1fr))',
                gap: 10,
              }}
            >
              {group.modules.map((mod) => (
                <LessonRow
                  key={mod.slug}
                  slug={mod.slug}
                  title={mod.title}
                  subtitle={mod.summary}
                  // The one dark row on the screen: the lesson for someone who
                  // has already clicked something and needs help now.
                  dark={group.category === 'incident-response'}
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
  const library = useLibrary();

  return (
    <Page width={slug ? 'lesson' : 'library'} gap={22}>
      <header>
        <Wordmark />
      </header>
      {/* One column on a phone; rail + article from 1024px. On the index the
          page IS the lesson list, so no rail and no grid. */}
      <div className={slug ? 'cs-learn-body' : undefined}>
        {slug && <LessonRail groups={library.groups} activeSlug={slug} />}
        <div className="cs-learn-main">
          {slug ? <ModuleView slug={slug} /> : <LibraryView state={library} />}
        </div>
      </div>
    </Page>
  );
}
