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

// Type roles from the handoff table, as ready-to-spread style objects.
export const type = {
  display: { fontSize: 34, lineHeight: 1.1, fontWeight: 500, letterSpacing: '-0.032em' },
  pageTitle: { fontSize: 28, lineHeight: 1.12, fontWeight: 500, letterSpacing: '-0.03em' },
  lessonH1: { fontSize: 27, lineHeight: 1.14, fontWeight: 500, letterSpacing: '-0.03em' },
  consoleH2: { fontSize: 24, lineHeight: 1.1, fontWeight: 500, letterSpacing: '-0.025em' },
  cardTitle: { fontSize: 19, lineHeight: 1.2, fontWeight: 500, letterSpacing: '-0.02em' },
  sectionH2: { fontSize: 18, lineHeight: 1.3, fontWeight: 500, letterSpacing: '-0.02em' },
  rowTitle: { fontSize: 17, lineHeight: 1.2, fontWeight: 500, letterSpacing: '-0.015em' },
  lead: { fontSize: 16, lineHeight: 1.6, fontWeight: 400 },
  body: { fontSize: 15, lineHeight: 1.5, fontWeight: 400 },
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

export default { color, font, radius, type, tabular, focusRing };
