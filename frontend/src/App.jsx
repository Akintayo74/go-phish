import React, { useEffect, useState } from 'react';
import AdminConsole from './admin/AdminConsole.jsx';
import LearningSite from './learn/LearningSite.jsx';
import EnrollView from './enroll/EnrollView.jsx';
import LandingPage from './landing/LandingPage.jsx';

// App shell. A tiny hash-based switch (no router dependency yet) selects between
// the public landing page, the Phase 3 admin console at #/admin, and the public
// CAT learning site at #/learn (Phase 6).
//
// Two design systems live here on purpose:
//
//   * "Civic" (ui/theme.js + styles/global.css) is the APP system — the console,
//     the learning site, the enrolment and disclosure screens. Quiet, flat, no
//     shadows, depth from 1px borders and a background ramp. It is the right
//     system for a screen someone has to work in.
//   * "Signal" (landing/ + styles/landing.css) is the MARKETING system, and it
//     covers exactly one screen: the landing page. Civic applied to a first
//     impression reads as a government form, which is the feedback that
//     produced it. It has elevation, a dark ground, motion and a serif accent —
//     and it keeps Civic's warm neutrals and indigo so the two still read as
//     one product.
//
// If the console and the learning site are elevated later, Signal's tokens are
// where to start; nothing about it is landing-specific except this route.
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

// NOTE: the landing screen used to carry a self-enrolment form (work email +
// department → "You are enrolled"). It posted nowhere and the confirmation was
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
//   * A public "type an email → get enrolled" endpoint lets anyone enter
//     SOMEONE ELSE'S address and make this system mail that person a phishing
//     simulation. That is an open relay wearing a consent form.
//   * Participants are pseudonymous (only a keyed hash is stored, which is why
//     POST /api/participants/lookup has to exist), so a bogus self-enrolment is
//     not reviewable by a human afterwards.
//
// The redesign did not reopen that door. The landing page still collects
// nothing at all — no form, no field — and offers the action that is genuinely
// available: the lessons are public and unauthenticated, so they open with no
// sign-up. Roster changes stay where consent lives, in the admin console.

export default function App() {
  const hash = useHashRoute();
  const isAdmin = hash === '#/admin';
  const isLearn = hash === '#/learn' || hash.startsWith('#/learn/');
  const isEnroll = hash.startsWith('#/enroll/');

  if (isAdmin) return <AdminConsole />;
  if (isEnroll) return <EnrollView hash={hash} />;
  if (isLearn) return <LearningSite hash={hash} />;
  return <LandingPage />;
}
