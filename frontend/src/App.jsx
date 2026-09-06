import React, { useEffect, useState } from 'react';
import AdminConsole from './admin/AdminConsole.jsx';
import LearningSite from './learn/LearningSite.jsx';
import EnrollView from './enroll/EnrollView.jsx';
import { color, radius, type, measure } from './ui/theme.js';
import { Page, Wordmark, Card, Note, Button, QuietLink, Eyebrow } from './ui/primitives.jsx';

// App shell. A tiny hash-based switch (no router dependency yet) selects between
// the public landing view, the Phase 3 admin console at #/admin, and the public
// CAT learning site at #/learn (Phase 6). The design system (the "Civic"
// direction) is applied across every one of these surfaces.
function useHashRoute() {
  const [hash, setHash] = useState(() =>
    typeof window !== 'undefined' ? window.location.hash : ''
  );
  useEffect(() => {
    const onChange = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return hash;
}

// Screen `2h` — the training landing. The first screen a participant sees.
//
// It offers exactly one action, and that action is real: the lessons are public
// and unauthenticated (see routes/learn.js), so they open with no sign-up and no
// email. Enrolment into a SIMULATION is deliberately not offered here — see the
// note on the enrolment card below. The screen also carries the load-bearing
// disclosure that simulations happen and are not scored against the individual.
// Five blocks enter on a 40ms omRise stagger.
//
// It sits in the `page` shell: the drawn single column up to 1024px, wider on a
// desktop so the card and the three-step strip are not a phone screenshot in the
// middle of a monitor. Every run of text inside carries its own measure cap, so
// widening the composition never widens a paragraph past readability.
function Landing() {
  const [health, setHealth] = useState('checking…');

  useEffect(() => {
    let active = true;
    fetch('/api/health')
      .then((r) => r.json())
      .then((data) => active && setHealth(data.status || 'unknown'))
      .catch(() => active && setHealth('unreachable'));
    return () => {
      active = false;
    };
  }, []);

  // 40ms increments between blocks (handoff: enrolment page stagger).
  const rise = (i) => ({ ['--cs-rise-delay']: `${i * 40}ms` });

  return (
    <Page background={color.surfaceRecessed} width="page" gap={24}>
      {/* 1 — header row */}
      <header className="cs-rise" style={rise(0)}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <Wordmark as="h1" />
          {/* The quiet door: the console is reachable but visually subordinate. */}
          <QuietLink href="#/admin">Administrator sign-in</QuietLink>
        </div>
      </header>

      {/* 2 + 3 — hero and enrolment card. Stacked as drawn on a phone; side by
          side from 1024px (`.cs-landing-hero`), which is what stops the card
          from stretching a full-width button across a monitor. */}
      <div className="cs-landing-hero">
        <section className="cs-rise" style={{ ...rise(1), display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h2 style={{ ...type.display, color: color.ink, maxWidth: '20ch', margin: 0 }}>
            Phishing awareness training for public service staff.
          </h2>
          <p style={{ ...type.lead, color: color.textSecondary, maxWidth: '52ch', margin: 0 }}>
            The lessons are open to everyone — no sign-up, no email. If your organisation runs
            CAT-Sim, you may also receive a simulated phishing message at some point, which you are
            not told about in advance.
          </p>
        </section>

        <Card
          as="section"
          className="cs-rise"
          radius={radius.outer}
          padding="24px 22px"
          style={{ ...rise(2), display: 'flex', flexDirection: 'column', gap: 18 }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <h3 style={{ ...type.cardTitle, color: color.ink, margin: 0 }}>Start the training</h3>
            <p style={{ fontSize: 14, lineHeight: 1.5, color: color.textMuted, margin: 0 }}>
              Short lessons, open to anyone. Nothing to sign up for, and we record nothing
              about who reads what.
            </p>
          </div>

          <a href="#/learn" style={{ textDecoration: 'none' }} data-testid="start-lessons">
            <Button variant="primary" full large>
              Start the lessons{' '}
              <span style={{ opacity: 0.7 }} aria-hidden="true">→</span>
            </Button>
          </a>

          <Note>
            <strong style={{ fontWeight: 600 }}>Simulations are never scored against you.</strong>{' '}
            Results are reported by cohort, not by person. Your manager does not see whether you
            clicked, and nothing you type into a simulated form is ever stored.
          </Note>

          <p style={{ fontSize: 13, lineHeight: 1.5, color: color.textMuted, margin: 0 }}>
            Does your organisation run CAT-Sim? Simulations are arranged by your programme
            administrator for a whole department at a time — ask your IT team to include yours.
            You cannot add yourself.
          </p>
        </Card>
      </div>

      {/* 4 — what happens after you enrol */}
      <section className="cs-rise" style={{ ...rise(3), display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Eyebrow>How the programme works</Eyebrow>
        <div
          style={{
            background: color.borderSubtle,
            borderRadius: radius.card,
            padding: 6,
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
            gap: 2,
          }}
        >
          {[
            ['01', 'The lessons are open now — take them in any order.'],
            ['02', 'If your organisation runs a simulation, a message arrives unannounced.'],
            ['03', 'Either way you land on a page explaining what it was.'],
          ].map(([num, text]) => (
            <div key={num} style={{ background: color.surface, borderRadius: radius.nested, padding: '16px 15px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span data-tabular style={{ fontSize: 13, fontWeight: 500, color: color.accent }}>{num}</span>
              <span style={{ ...type.body, ...measure, color: color.textBody }}>{text}</span>
            </div>
          ))}
        </div>
      </section>

      {/* 5 — footer */}
      <footer
        className="cs-rise"
        style={{
          ...rise(4),
          borderTop: `1px solid ${color.borderSubtle}`,
          paddingTop: 18,
          display: 'flex',
          flexWrap: 'wrap',
          gap: 12,
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <p style={{ ...type.body, ...measure, color: color.textMuted, margin: 0 }}>
          How your data is handled, and what a simulation does and does not record.
        </p>
        <a href="#/learn" style={{ textDecoration: 'none' }}>
          <Button variant="secondary">
            Participation notice{' '}
            <span style={{ color: color.textMuted }} aria-hidden="true">→</span>
          </Button>
        </a>
      </footer>

      {/* Backend status kept as a quiet operational footer (health check). */}
      <p style={{ fontSize: 12, color: color.textMuted, margin: 0, textAlign: 'center' }}>
        Service status: <strong data-testid="health" style={{ fontWeight: 500, color: color.textSecondary }}>{health}</strong>
      </p>
    </Page>
  );
}

// NOTE: this screen used to carry a self-enrolment form (work email +
// department -> "You are enrolled"). It posted nowhere and the confirmation was
// fabricated, which a platform whose whole claim is transparency cannot do.
//
// It was not rewired to a real endpoint, because self-enrolment is not a
// missing feature — it is excluded by the design:
//
//   * Consent in CAT-Sim is ORGANISATIONAL and cohort-level, with a signed
//     authorisation on file per cohort (IMPLEMENTATION_PLAN.md guardrail #3,
//     PRE_LAUNCH_CHECKLIST.md §7). A web form cannot stand in for that, and it
//     would create a route into a consented cohort that never passed a Program
//     Admin.
//   * A public "type an email -> get enrolled" endpoint lets anyone enter
//     SOMEONE ELSE'S address and make this system mail that person a phishing
//     simulation. That is an open relay wearing a consent form.
//   * Participants are pseudonymous (only a keyed hash is stored, which is why
//     POST /api/participants/lookup has to exist), so a bogus self-enrolment is
//     not reviewable by a human afterwards.
//
// The screen now offers the action that is genuinely available: the lessons are
// public and unauthenticated, so they open with no sign-up at all. Roster
// changes stay where consent lives — the admin console.

export default function App() {
  const hash = useHashRoute();
  const isAdmin = hash === '#/admin';
  const isLearn = hash === '#/learn' || hash.startsWith('#/learn/');
  const isEnroll = hash.startsWith('#/enroll/');

  if (isAdmin) return <AdminConsole />;
  if (isEnroll) return <EnrollView hash={hash} />;
  if (isLearn) return <LearningSite hash={hash} />;
  return <Landing />;
}
