import React, { useEffect, useState } from 'react';
import '../styles/landing.css';
import PhishingDemo from './PhishingDemo.jsx';
import { useLandingMotion } from './motion.js';

// ---------------------------------------------------------------------------
// CAT-Sim landing page — the "Signal" direction.
//
// This replaces the Civic landing screen, which was a correct application of
// the app's design system and, as a first impression, read as a form. Signal is
// a marketing surface with its own rules (see the header of styles/landing.css)
// while the console and the learning site stay on Civic untouched.
//
// The composition is bands: a dark hero with a self-playing simulation, warm
// light sections for the explanation, a dark ledger for the guarantee, and a
// dark close. The contrast between the bands is what does the work — the app's
// own warm off-white is kept for the light ones so this still reads as the same
// product, not a different company's website.
//
// Two things are load-bearing and survived the redesign unchanged, because they
// are the reason this project exists rather than decoration on top of it:
//
//   * The page collects NOTHING. No form, no field, no email capture. Consent
//     in CAT-Sim is organisational and cohort-level with a signed authorisation
//     on file (IMPLEMENTATION_PLAN.md guardrail #3), so a public "type an email
//     → get enrolled" control would be an open relay wearing a consent form.
//     The only outbound request on this page is the health check.
//   * Every claim made here is one the product actually keeps: cohort-level
//     reporting, nothing stored about who reads what, nothing kept from a
//     simulated form. No invented customer counts, no fabricated logos, no
//     "trusted by" strip. A page selling honesty cannot open with a fiction.
//
// Styling is class-based rather than the inline-token approach Civic uses. That
// is a deliberate split: keyframes, hover, masks, backdrop-filter and media
// queries cannot live in a style attribute, and the landing tests assert
// content and structure (the CTA's target, that nothing is collected), never a
// computed style — so Vitest's `css: false` costs this file nothing.
// ---------------------------------------------------------------------------

// The headline, one array entry per masked line. Each line slides up out of its
// own overflow-hidden box on a 105ms stagger. `accent` gets Instrument Serif
// italic: the promise glows in the brand gradient, the thing being rejected is
// deliberately dimmed.
const HEADLINE = [
  [{ text: 'Phishing training' }],
  [{ text: 'built on ' }, { text: 'consent', accent: 'lit' }, { text: ',' }],
  [{ text: 'not ' }, { text: 'gotchas', accent: 'dim' }, { text: '.' }],
];

// Illustrative lure patterns for the marquee. Labelled as illustrative in the
// section copy — these are the shapes the lessons drill, not messages anyone
// received, and no real organisation or address appears in them.
const LURES = [
  ['Action required: re-verify your account within 2 hours', 'Manufactured deadline'],
  ['Your salary slip could not be delivered', 'Payroll lure'],
  ['IT: mandatory password reset before 17:00 today', 'False authority'],
  ['Shared document — 2026 restructuring plan.pdf', 'Curiosity'],
  ['Unusual sign-in from a new device. Was this you?', 'Fear'],
  ['Invoice #40921 overdue — approval needed', 'Pressure from above'],
  ['Your mailbox is full. Restore delivery now.', 'Threatened disruption'],
  ['HR: confirm your bank details for the new system', 'Credential grab'],
];

const STEPS = [
  {
    num: '01',
    title: 'The lessons are open right now.',
    text:
      'Short modules on the tells above, taken in any order. No account, no email address, and nothing stored about who reads what.',
    art: 'stack',
  },
  {
    num: '02',
    title: 'A simulation may arrive unannounced.',
    text:
      'If your organisation runs one, a message lands in your inbox with no warning. That is the point — a test you were told about measures nothing.',
    art: 'ping',
  },
  {
    num: '03',
    title: 'Either way, you land on an explanation.',
    text:
      'Click it or ignore it: everyone reaches the same page describing what the message was and what gave it away.',
    art: 'reveal',
  },
];

const RECORDED = [
  'That a message sent to a cohort was opened',
  'That a link in that message was clicked',
  'Rates for the department as a whole',
  'Which lessons are published, and when',
];

const NEVER = [
  'Your name attached to a click',
  'Anything typed into a simulated form',
  'Which lessons you personally opened',
  'A score your manager can look up',
];

const GUARANTEES = [
  { value: '100', suffix: '%', label: 'of simulation results reported at cohort level, never per person' },
  { value: '0', label: 'identifying details stored about who reads which lesson' },
  { value: '0', label: 'characters kept from anything typed into a simulated form' },
];

// A marquee row. The track is rendered twice and the animation travels exactly
// -50%, which is what makes the loop seamless; the duplicate is hidden from the
// accessibility tree so the list is not announced twice.
function LureRow({ items, reverse = false }) {
  const track = (
    <div className="l-marquee-track">
      {items.map(([subject, tag]) => (
        <span className="l-lure" key={subject}>
          <span className="l-lure-subject">{subject}</span>
          <span className="l-lure-tag">{tag}</span>
        </span>
      ))}
    </div>
  );
  return (
    <div className={`l-marquee-row${reverse ? ' l-marquee-row--rev' : ''}`}>
      {track}
      <div aria-hidden="true" style={{ display: 'contents' }}>
        {track}
      </div>
    </div>
  );
}

// The small CSS-only figures inside the bento cells. Decoration, so each is
// hidden from assistive tech — the cell's own heading and paragraph carry the
// meaning. They idle rather than sit still, which is the whole difference
// between a page that feels built and a page that feels printed.
function CellArt({ kind }) {
  if (kind === 'stack') {
    return (
      <div className="l-art l-art--wide" aria-hidden="true">
        <div className="l-stack">
          {[0, 1, 2].map((s) => (
            <i key={s} style={{ '--s': String(s) }} />
          ))}
          <span className="l-stack-bar">
            <span />
          </span>
        </div>
      </div>
    );
  }
  if (kind === 'ping') {
    return (
      <div className="l-art" aria-hidden="true">
        {[0, 1, 2].map((p) => (
          <span className="l-ping" key={p} style={{ '--p': String(p) }} />
        ))}
        <span className="l-envelope" />
      </div>
    );
  }
  return (
    <div className="l-art" aria-hidden="true">
      <div className="l-reveal-art">
        <div className="l-reveal-back">Action required: re-verify your account within 2 hours</div>
        <div className="l-reveal-front">
          <span>
            <strong>This was a simulation.</strong>
            Here is what gave it away.
          </span>
        </div>
      </div>
    </div>
  );
}

export default function LandingPage() {
  const { rootRef, navRef } = useLandingMotion();
  const [health, setHealth] = useState('checking…');

  // The only request this page makes. Unchanged from the Civic landing.
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

  return (
    <div className="l-root" ref={rootRef}>
      <span className="l-progress" aria-hidden="true" />

      {/* ---- Nav --------------------------------------------------------
          A sibling of the hero, not a child of it: the hero clips its own
          ambient layers, and a `position: sticky` element inside an
          `overflow: clip` ancestor is clipped away as soon as it leaves that
          ancestor. The hero's negative top margin pulls its aurora up behind
          this bar, so it still reads as one band. */}
      <nav className="l-nav" ref={navRef} aria-label="Primary">
        <div className="l-wrap l-nav-inner">
          {/* The site name is the page's h1; the hero headline below is an
              h2. A landing page has one name and many claims. */}
          <h1 className="l-mark" aria-label="CAT-Sim">
            <span className="l-mark-tile" aria-hidden="true" />
            <span aria-hidden="true">CAT{'‑'}Sim</span>
          </h1>
          <div className="l-nav-actions">
            {/* The quiet door: reachable, visually subordinate — the one rule
                carried over wholesale from the Civic landing. */}
            <a className="l-quiet" href="#/admin">
              Administrator sign-in
            </a>
          </div>
        </div>
      </nav>

      {/* ---- Hero ------------------------------------------------------- */}
      <div className="l-hero">
        {/* Three ambient layers: drifting aurora, a radially-masked grid, and
            grain. The grain is what stops the big gradients banding and gives
            the black a surface — it is doing more work than it looks like. */}
        <div className="l-aurora" aria-hidden="true">
          <span className="l-blob l-blob--1" />
          <span className="l-blob l-blob--2" />
          <span className="l-blob l-blob--3" />
        </div>
        <div className="l-grid" aria-hidden="true" />
        <div className="l-grain" aria-hidden="true" />

        <div className="l-wrap l-hero-body">
          <div className="l-hero-grid">
            <div className="l-hero-copy">
              <span className="l-eyebrow l-hero-eyebrow">
                <span className="l-dot" aria-hidden="true" />
                Consent-based phishing simulation
              </span>

              <h2 className="l-h1">
                {HEADLINE.map((line, i) => (
                  <span className="l-line" key={line.map((p) => p.text).join('')} style={{ '--i': String(i) }}>
                    <span>
                      {line.map((part) =>
                        part.accent ? (
                          <em
                            key={part.text}
                            className={`l-serif${part.accent === 'lit' ? ' l-grad-text' : ''}`}
                            style={part.accent === 'dim' ? { color: '#6b7183' } : undefined}
                          >
                            {part.text}
                          </em>
                        ) : (
                          <React.Fragment key={part.text}>{part.text}</React.Fragment>
                        )
                      )}
                    </span>
                  </span>
                ))}
              </h2>

              <p className="l-hero-lead">
                Short lessons anyone can open — no sign-up, no email address, and nothing recorded
                about who reads what. If your organisation runs CAT{'‑'}Sim, a simulated
                phishing message may also arrive unannounced. You are never scored for it.
              </p>

              <div className="l-cta-row">
                <a className="l-btn l-btn--primary l-btn--lg" href="#/learn" data-testid="start-lessons">
                  Start the lessons
                  <span className="l-btn-arrow" aria-hidden="true">
                    →
                  </span>
                </a>
                <a className="l-btn l-btn--glass l-btn--lg" href="#how">
                  See how it works
                </a>
              </div>

              <ul className="l-assurances">
                {['No sign-up', 'No email address', 'Never scored per person'].map((item) => (
                  <li key={item}>
                    <span className="l-tick" aria-hidden="true">
                      ✓
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <PhishingDemo />
          </div>
        </div>
      </div>

      {/* ---- Lure patterns ---------------------------------------------- */}
      <section className="l-section l-section--canvas l-section--tight">
        <div className="l-wrap">
          <div className="l-head l-head--center" data-reveal>
            <span className="l-eyebrow">What the lessons drill</span>
            <h2 className="l-h2">
              The tells are nearly always the <em className="l-serif l-grad-text">same few things</em>.
            </h2>
            <p className="l-sub">
              Every lure in the training is built from patterns like these. Illustrative examples —
              no real message, address or organisation is shown anywhere on this page.
            </p>
          </div>
        </div>
        <div className="l-marquee" data-reveal style={{ '--d': '120ms' }}>
          <LureRow items={LURES} />
          <LureRow items={[...LURES].reverse()} reverse />
        </div>
      </section>

      {/* ---- How it works ------------------------------------------------ */}
      <section className="l-section" id="how">
        <div className="l-wrap">
          <div className="l-head" data-reveal>
            <span className="l-eyebrow">How the programme works</span>
            <h2 className="l-h2">Three steps, and you are told about all three.</h2>
            <p className="l-sub">
              Nothing below is a surprise except the timing of the message itself — which is the
              only part that has to be, for the exercise to measure anything at all.
            </p>
          </div>

          <div className="l-bento">
            {STEPS.map((step, i) => (
              <article
                className="l-card l-card--lift l-card--edge l-spot"
                key={step.num}
                data-reveal="scale"
                style={{ '--d': `${i * 110}ms` }}
              >
                <div className="l-bento-cell">
                  <span className="l-step-num">{step.num}</span>
                  <h3 className="l-cell-title">{step.title}</h3>
                  <p className="l-cell-text">{step.text}</p>
                </div>
                <CellArt kind={step.art} />
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ---- The guarantee ----------------------------------------------- */}
      <section className="l-section l-section--dark">
        <div className="l-aurora" aria-hidden="true" style={{ opacity: 0.4 }}>
          <span className="l-blob l-blob--2" />
          <span className="l-blob l-blob--3" />
        </div>
        <div className="l-grain" aria-hidden="true" />

        <div className="l-wrap">
          <div className="l-head" data-reveal>
            <span className="l-eyebrow">The guarantee</span>
            <h2 className="l-h2">
              What a simulation records — and what it <em className="l-serif l-grad-text">never touches</em>.
            </h2>
            <p className="l-sub">
              This is not a policy page promising good behaviour later. It is what the system is
              built to be able to do, which is a much shorter list.
            </p>
          </div>

          <div className="l-ledger">
            <div className="l-ledger-col l-spot" data-reveal>
              <h3>
                <span className="l-mark-icon l-mark-icon--yes" aria-hidden="true">
                  ✓
                </span>
                Recorded, at cohort level
              </h3>
              <ul className="l-ledger-list">
                {RECORDED.map((item) => (
                  <li key={item}>
                    <span className="l-mark-icon l-mark-icon--yes" aria-hidden="true">
                      ✓
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <div className="l-ledger-col l-spot" data-reveal style={{ '--d': '120ms' }}>
              <h3>
                <span className="l-mark-icon l-mark-icon--no" aria-hidden="true">
                  ✕
                </span>
                Never recorded, by anyone
              </h3>
              <ul className="l-ledger-list">
                {NEVER.map((item, i) => (
                  <li key={item}>
                    <span className="l-mark-icon l-mark-icon--no" aria-hidden="true">
                      ✕
                    </span>
                    {/* The rule is drawn, not text-decoration, so it can sweep
                        across as the column arrives. */}
                    <span className="l-strike" style={{ '--d': `${300 + i * 130}ms` }}>
                      {item}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="l-stats" data-reveal style={{ '--d': '160ms', marginTop: 20 }}>
            {GUARANTEES.map((stat) => (
              <div className="l-stat" key={stat.label}>
                <span
                  className="l-stat-value"
                  data-count={stat.value}
                  data-suffix={stat.suffix || ''}
                >
                  {stat.value}
                  {stat.suffix || ''}
                </span>
                <span className="l-stat-label">{stat.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---- Start / administrators -------------------------------------- */}
      <section className="l-section l-section--canvas">
        <div className="l-wrap">
          <div className="l-cta-card l-spot" data-reveal="scale">
            <span className="l-eyebrow">Open to anyone</span>
            <h2 className="l-h2" style={{ maxWidth: '16ch' }}>
              Start the training.
            </h2>
            <p className="l-sub">
              Short lessons, open to anyone, with nothing to sign up for. We record nothing about
              who reads what.
            </p>

            <div className="l-promise">
              <span className="l-promise-dot" aria-hidden="true" />
              <span>
                <strong>Simulations are never scored against you.</strong> Results are reported by
                cohort, not by person. Your manager does not see whether you clicked, and nothing
                you type into a simulated form is ever stored.
              </span>
            </div>

            <a className="l-btn l-btn--ink l-btn--lg" href="#/learn">
              Start the lessons
              <span className="l-btn-arrow" aria-hidden="true">
                →
              </span>
            </a>
          </div>

          <div className="l-admin" data-reveal style={{ '--d': '120ms', marginTop: 20 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <h2 className="l-cell-title" style={{ fontSize: 20 }}>
                For programme administrators
              </h2>
              <p className="l-cell-text" style={{ maxWidth: '62ch' }}>
                Simulations are arranged for a whole department at a time, against a signed
                authorisation held on file for that cohort. Ask your IT team to include yours — you
                cannot add yourself, and neither can anyone else add you by typing your address into
                a public page.
              </p>
            </div>
            <a className="l-btn l-btn--outline" href="#/admin">
              Administrator sign-in
              <span className="l-btn-arrow" aria-hidden="true">
                →
              </span>
            </a>
          </div>
        </div>
      </section>

      {/* ---- Close -------------------------------------------------------- */}
      <section className="l-section l-section--dark">
        <div className="l-aurora" aria-hidden="true" style={{ opacity: 0.55 }}>
          <span className="l-blob l-blob--1" />
          <span className="l-blob l-blob--3" />
        </div>
        <div className="l-grain" aria-hidden="true" />

        <div className="l-wrap l-wrap--narrow">
          <div className="l-close" data-reveal>
            <span className="l-eyebrow">
              <span className="l-dot" aria-hidden="true" />
              Nothing to sign up for
            </span>
            <h2 className="l-h2">
              Learn the tells before <em className="l-serif l-grad-text">someone else</em> teaches
              them to you.
            </h2>
            <p className="l-sub" style={{ textAlign: 'center' }}>
              A few minutes, in any order, from any device. The lessons ask nothing of you.
            </p>
            <a
              className="l-btn l-btn--primary l-btn--lg"
              href="#/learn"
              data-testid="start-lessons-closing"
            >
              Open the lessons
              <span className="l-btn-arrow" aria-hidden="true">
                →
              </span>
            </a>
          </div>
        </div>
      </section>

      {/* ---- Footer ------------------------------------------------------- */}
      <footer className="l-footer">
        <div className="l-wrap">
          <div className="l-footer-grid">
            <div className="l-footer-col">
              {/* A span, not a heading: the page has exactly one h1 and it is
                  in the nav. */}
              <span className="l-mark">
                <span className="l-mark-tile" aria-hidden="true" />
                <span>CAT{'‑'}Sim</span>
              </span>
              <p className="l-footer-note">
                Consent-based phishing simulation and cybersecurity awareness training for public
                service staff.
              </p>
            </div>

            <div className="l-footer-col">
              <h4>Training</h4>
              <a href="#/learn">All lessons</a>
              <a href="#how">How the programme works</a>
              <a href="#/learn">Participation notice</a>
            </div>

            <div className="l-footer-col">
              <h4>Programme</h4>
              <a href="#/admin">Administrator sign-in</a>
              <a href="#/learn">What is and is not recorded</a>
            </div>
          </div>

          <div className="l-footer-base">
            <span>© {new Date().getFullYear()} CAT{'‑'}Sim</span>
            <span className="l-status">
              Service status:
              <strong data-testid="health" style={{ fontWeight: 500, color: 'var(--l-on-dark-soft)' }}>
                {health}
              </strong>
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
