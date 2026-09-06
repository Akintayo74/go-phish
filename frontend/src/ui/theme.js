// CAT-Sim design tokens (the "Civic" direction, Section 2 of the handoff).
//
// This is the single source of truth for colour, type, spacing, radius and
// motion across the whole app. The values are ported verbatim from the design
// handoff (design_handoff_catsim/README.md) — do not lighten a grey, do not
// substitute a cool grey for a warm one, and do not add shadows. Depth is the
// background ramp (recessed → surface → raised) plus 1px borders; the only
// box-shadow in the system is the focus ring.
//
// The same tokens are mirrored as CSS custom properties in styles/global.css so
// that element-level base styling (fonts, links, scrollbars) and keyframes can
// reference them. Components import THIS object for inline styles, because the
// Vitest config runs with `css: false` — class-based styling would not apply in
// tests, but inline styles set a real style attribute jsdom can see. Keeping the
// look in JS therefore keeps it deterministic under test as well as in the app.
//
// LAYOUT is the one deliberate exception to "look lives in JS". A screen that
// changes shape at a breakpoint (the learning site's desktop rail) cannot be
// expressed in an inline style at all, so those few rules live in global.css
// under `.cs-shell` / `.cs-learn-*`. Everything a `clamp()` can express — fluid
// type, fluid gutters, width caps — stays here in JS. No test asserts a width,
// so nothing is lost to `css: false`.

export const color = {
  canvas: '#f4f4f2',
  surfaceRecessed: '#f7f7f5',
  surface: '#fcfcfb',
  surfaceRaised: '#ffffff',
  surfaceSunken: '#f1f2ef',
  border: '#e3e3df',
  borderSubtle: '#ececea',
  borderFrame: '#dededa',
  borderStrong: '#c9c9c3',
  ink: '#16171a',
  inkHover: '#2c2e33',
  textBody: '#33373a',
  textSecondary: '#55595c',
  textMuted: '#64686b',
  textMutedAlt: '#6f7377',
  textOnDarkMuted: '#a9abb4',
  radioEmpty: '#b6b8bb',
  accent: '#3f4bbd',
  accentHover: '#333ea8',
  accentText: '#4b55a8',
  accentInk: '#24284a',
  accentWash: '#eef0fb',
  accentOnDark: '#d5d9f4',
  success: '#1c7049',
  warning: '#8a5200',
  // No red token exists in the palette. When an error state genuinely needs
  // one, derive it warm — in the same family as `warning` — rather than
  // importing a default browser red (handoff: States to build → Error).
  danger: '#a13a2a',
  dangerWash: '#f7ece9',
  white: '#ffffff',
};

// Single family: Instrument Sans, with a real fallback stack. 400 body, 500
// heading/button, 600 only on the wordmark and <strong> in accent-wash notes.
export const font = "'Instrument Sans', system-ui, -apple-system, BlinkMacSystemFont, sans-serif";

export const radius = {
  logo: 6,
  nav: 9,
  button: 10,
  nested: 10,
  input: 11,
  option: 11,
  metric: 11,
  card: 14,
  note: 14,
  cta: 14,
  outer: 18,
  pill: 999,
};

// The consent hold duration (2c). Reduced to 400ms under prefers-reduced-motion
// — still a hold, still deliberate. Read at call time so a change to the user's
// OS setting is honoured without a reload.
export const HOLD_MS = 1600;
export const HOLD_MS_REDUCED = 400;

export function prefersReducedMotion() {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

// Numbers that update should not make the layout jitter — tabular figures keep
// every digit the same width.
export const tabular = { fontVariantNumeric: 'tabular-nums' };

// The focus ring is the one and only box-shadow in the system.
export const focusRing = {
  borderColor: color.accent,
  boxShadow: `0 0 0 3px ${color.accentWash}`,
  outline: 'none',
};

// --------------------------------------------------------------------------
// Fluid scale
// --------------------------------------------------------------------------

// The design was drawn at 390px. `fluid` keeps that drawing exact at 390px and
// interpolates linearly up to the 1280px desktop value, so nothing about the
// mobile composition changes and nothing on a desktop is a blown-up phone. The
// clamp() floors and ceilings mean the value is stable outside that range.
//
// It emits a plain CSS string, so it works in an inline style object exactly as
// it does in the stylesheet — no media query, no resize listener, no re-render.
const MOBILE_VW = 390;
const DESKTOP_VW = 1280;

export function fluid(min, max, fromVw = MOBILE_VW, toVw = DESKTOP_VW) {
  const slope = (max - min) / (toVw - fromVw);
  const intercept = min - slope * fromVw;
  return `clamp(${min}px, ${intercept.toFixed(2)}px + ${(slope * 100).toFixed(3)}vw, ${max}px)`;
}

// --------------------------------------------------------------------------
// Layout
// --------------------------------------------------------------------------

// Width caps, as the OUTER width of a centred column — the page gutter is
// inside them, because `* { box-sizing: border-box }` is set globally.
//
// Every one of these exists to serve a reading measure. Long-form text is
// unreadable much past ~70 characters a line, which at the desktop prose size
// (17px Instrument Sans, ~9.4px per character) is about 660px of text; that is
// where `prose` and `lesson` come from, and it is why widening a screen for
// desktop is capping it, not stretching it. `page` and `console` are wider
// because what they hold is a composition or a table, not a paragraph.
export const layout = {
  // A form or a short stack of cards (admin sign-in, enrolment).
  column: 760,
  // Long-form text: one lesson, the participation notice.
  prose: 740,
  // A full composition — the landing page, the resource library. Goes wide only
  // on a desktop; see `.cs-shell--page` in global.css.
  page: 1120,
  // The learning site's lesson view: rail + article. See `.cs-shell--lesson`.
  lesson: 1020,
  // The resource library. Narrower than `page` on purpose: its grid is sized so
  // the lesson rows fill the width in two columns instead of leaving a dead
  // third track, which is what a wider cap produces at this lesson count.
  library: 900,
  // The desktop lesson rail on the learning site.
  rail: 248,
  // The console content pane. Wide enough for a roster table, capped so a 27"
  // display does not stretch one row across 2000px.
  console: 1400,
  // A data-entry form inside a wide pane. A single-line text field is not more
  // usable for being 1300px long — the console's forms are capped here while the
  // lists and tables beside them keep the full pane.
  form: 640,
  // The breakpoint at which the learning site grows its second column. Mirrored
  // in global.css — change both together.
  desktopMin: 1024,
  // Page gutter: the drawn 20px on a phone, 40px on a desktop.
  gutter: fluid(20, 40),
  // Vertical breathing room around a screen's content.
  pagePadding: fluid(22, 40),
};

// Type roles from the handoff table, as ready-to-spread style objects. The
// mobile size is the drawn value; the second `fluid` argument is where it lands
// on a desktop. Small UI text (meta, label, eyebrow, pill) is deliberately
// fixed — 12px is 12px on any screen, and scaling it only makes chrome shout.
export const type = {
  display: { fontSize: fluid(34, 46), lineHeight: 1.1, fontWeight: 500, letterSpacing: '-0.032em' },
  pageTitle: { fontSize: fluid(28, 38), lineHeight: 1.12, fontWeight: 500, letterSpacing: '-0.03em' },
  lessonH1: { fontSize: fluid(27, 36), lineHeight: 1.14, fontWeight: 500, letterSpacing: '-0.03em' },
  consoleH2: { fontSize: fluid(24, 30), lineHeight: 1.1, fontWeight: 500, letterSpacing: '-0.025em' },
  cardTitle: { fontSize: fluid(19, 22), lineHeight: 1.2, fontWeight: 500, letterSpacing: '-0.02em' },
  sectionH2: { fontSize: fluid(18, 21), lineHeight: 1.3, fontWeight: 500, letterSpacing: '-0.02em' },
  rowTitle: { fontSize: fluid(17, 19), lineHeight: 1.2, fontWeight: 500, letterSpacing: '-0.015em' },
  lead: { fontSize: fluid(16, 18), lineHeight: 1.6, fontWeight: 400 },
  body: { fontSize: fluid(15, 16), lineHeight: 1.5, fontWeight: 400 },
  meta: { fontSize: 13, lineHeight: 1.5, fontWeight: 400 },
  label: { fontSize: 13, lineHeight: 1, fontWeight: 500 },
  eyebrow: {
    fontSize: 12,
    lineHeight: 1,
    fontWeight: 500,
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
  },
  pill: { fontSize: 11, lineHeight: 1, fontWeight: 500 },
};

// A reading measure for a paragraph that sits in a container wider than itself
// — a card body on the landing page, the library intro. In `ch` so it tracks
// the font size rather than fighting it.
export const measure = { maxWidth: '62ch' };

export default { color, font, radius, type, layout, measure, tabular, focusRing };
