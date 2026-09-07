import React from 'react';

// The hero visual: a simulation, playing itself.
//
// A lure arrives in a mock inbox, a scan sweeps it, three tells are called out
// one at a time, and it resolves to "reported". It is the product's whole
// argument in twelve seconds, which a screenshot cannot be.
//
// There is no JavaScript in it at all. Every animated element runs a CSS
// animation of exactly `--l-demo` (15s, set on `.l-root`), so they share one
// clock and the schedule is nothing but keyframe percentages — no timers to
// drift, nothing to clean up on unmount, and no state updates firing outside
// act() in tests. Under prefers-reduced-motion the whole thing settles on its
// most informative frame: every tell and the verdict, all visible, no movement.
//
// The address is deliberately fictional. `northgate-c0uncil.org` uses a zero
// for the "o" — the single most common lookalike trick, and legible as such at
// this size. Nothing here resolves to a real organisation.
//
// Accessibility: the markup is a pile of decorative divs that would read as
// noise, so it is exposed as one image with a label describing what it shows.
const DEMO_LABEL =
  'An animated demonstration. A phishing email from "IT Helpdesk" at the ' +
  'lookalike address it-helpdesk@northgate-c0uncil.org arrives and is scanned. ' +
  'Three warning signs are highlighted in turn: the lookalike domain, the ' +
  'manufactured deadline, and a link whose text does not match its destination. ' +
  'The message is then reported as phishing, with no credentials entered.';

// The three tells, in the order the demo calls them out. Their entrance times
// are keyed off source order in the stylesheet (`.l-tell:nth-child(n)`), so
// reordering this array reorders the demo.
const TELLS = [
  { label: 'Lookalike domain', detail: 'c0uncil, with a zero' },
  { label: 'Manufactured deadline', detail: '“within 2 hours”' },
  { label: 'Link text ≠ destination', detail: 'points off-domain' },
];

export default function PhishingDemo() {
  return (
    <div className="l-demo">
      <div className="l-device" role="img" aria-label={DEMO_LABEL}>
        <div className="l-device-bar" aria-hidden="true">
          <span className="l-lights">
            <i />
            <i />
            <i />
          </span>
          <span className="l-device-title">Inbox</span>
          <span className="l-device-live">
            <span className="l-dot" />
            Simulation
          </span>
        </div>

        <div className="l-device-body" aria-hidden="true">
          <article className="l-mail">
            <header className="l-mail-head">
              <span className="l-avatar">IT</span>
              <span className="l-mail-from">
                <span className="l-mail-name">IT Helpdesk</span>
                <span className="l-mail-addr">
                  it-helpdesk@northgate-c<span className="l-swap">0</span>uncil.org
                </span>
              </span>
              <span className="l-mail-time">09:14</span>
            </header>

            <h3 className="l-mail-subject">Action required: re-verify your account within 2 hours</h3>

            <p className="l-mail-preview">
              Our records show your staff account has not been validated. Access will be suspended
              unless you confirm your details at{' '}
              <span className="l-mail-link">staff-portal.northgate.gov</span>.
            </p>
          </article>

          <div className="l-tells">
            {TELLS.map((tell) => (
              <div key={tell.label} className="l-tell">
                <span className="l-tell-icon">!</span>
                <span>
                  <b>{tell.label}</b> — {tell.detail}
                </span>
              </div>
            ))}
          </div>

          <div className="l-verdict">
            <svg className="l-verdict-ring" viewBox="0 0 30 30">
              <circle className="l-ring-track" cx="15" cy="15" r="13" />
              <circle className="l-ring-fill" cx="15" cy="15" r="13" />
              <path className="l-ring-tick" d="M9.5 15.4l4 4 7-8" fill="none" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="l-verdict-text">
              <strong>Reported as phishing</strong>
              <span>No credentials entered. Nothing typed was stored.</span>
            </span>
          </div>
        </div>
      </div>

      <div className="l-chip-float" aria-hidden="true">
        <span className="l-dot" />
        Three tells, spotted in eleven seconds
      </div>
    </div>
  );
}
