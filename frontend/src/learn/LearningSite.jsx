import React, { useEffect, useState } from 'react';
import { learnApi } from './api.js';
import { Markdown } from './markdown.jsx';
import Quiz from './Quiz.jsx';

// Public CAT learning site (Phase 6). Two views, selected by hash:
//   #/learn          → the resource library (modules grouped by category)
//   #/learn/<slug>   → one lesson module, its markdown body rendered
//
// Fully public and read-only — no login, and nothing about who reads what is
// sent to the server beyond the plain content GET.

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
    <section>
      <p>
        <a href="#/learn">← Back to the resource library</a>
      </p>

      {state.status === 'loading' && <p data-testid="module-loading">Loading…</p>}

      {state.status === 'error' && state.error === 'not_found' && (
        <p data-testid="module-error">That lesson could not be found.</p>
      )}
      {state.status === 'error' && state.error === 'unreachable' && (
        <p data-testid="module-error">The learning content is currently unavailable.</p>
      )}

      {state.status === 'ready' && state.module && (
        <>
          <article data-testid="module">
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

  return (
    <section>
      <p>
        Free, self-paced lessons on recognizing and responding to phishing and
        social engineering. Anyone may read them — no account needed.
      </p>

      {state.status === 'loading' && <p data-testid="library-loading">Loading…</p>}

      {state.status === 'error' && (
        <p data-testid="library-error">The learning content is currently unavailable.</p>
      )}

      {state.status === 'ready' && state.groups.length === 0 && (
        <p data-testid="library-empty">No lessons are published yet.</p>
      )}

      {state.status === 'ready' &&
        state.groups.map((group) => (
          <div key={group.category} data-testid="library-category">
            <h3>{categoryLabel(group.category)}</h3>
            <ul>
              {group.modules.map((mod) => (
                <li key={mod.slug}>
                  <a href={`#/learn/${encodeURIComponent(mod.slug)}`}>{mod.title}</a>
                  {mod.summary ? <> — {mod.summary}</> : null}
                </li>
              ))}
            </ul>
          </div>
        ))}
    </section>
  );
}

export default function LearningSite({ hash }) {
  const slug = slugFromHash(hash);
  return (
    <section>
      <h2>Cybersecurity Awareness Training</h2>
      {slug ? <ModuleView slug={slug} /> : <LibraryView />}
    </section>
  );
}
