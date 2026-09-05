import React, { useEffect, useRef, useState } from 'react';
import { color, font, radius, type, tabular, HOLD_MS, HOLD_MS_REDUCED, prefersReducedMotion } from './theme.js';

// Shared CAT-Sim primitives. Every screen is built from these so the direction
// rule ("the next action is the darkest thing on screen; exactly one ink-filled
// control per view, or none") is enforced by construction rather than by
// vigilance: `variant="primary"` is the only ink fill, `variant="accent"` is the
// disclosure CTA (the one accent fill in the system), and everything else is a
// bordered secondary, a quiet link, or an overflow item.

// ---------------------------------------------------------------------------
// Brand
// ---------------------------------------------------------------------------

export function Logo({ size = 20 }) {
  return (
    <span
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        borderRadius: radius.logo,
        background: color.accent,
        flex: 'none',
        display: 'inline-block',
      }}
    />
  );
}

// The wordmark uses a non-breaking hyphen so "CAT-Sim" never wraps. When
// rendered as a heading (`as="h1"`), an aria-label carries the plain-hyphen
// name so assistive tech (and tests) read "CAT-Sim" while the eye still sees the
// non-breaking form.
export function Wordmark({ size = 14, gap = 8, as: Tag = 'span', style, ...rest }) {
  const headingProps = Tag !== 'span' ? { 'aria-label': 'CAT-Sim' } : {};
  return (
    <Tag
      style={{ display: 'inline-flex', alignItems: 'center', gap, margin: 0, fontWeight: 600, ...style }}
      {...headingProps}
      {...rest}
    >
      <Logo />
      <span
        aria-hidden={Tag !== 'span' ? 'true' : undefined}
        style={{
          fontSize: size,
          fontWeight: 600,
          letterSpacing: '-0.01em',
          color: color.ink,
          whiteSpace: 'nowrap',
        }}
      >
        CAT{'‑'}Sim
      </span>
    </Tag>
  );
}

// ---------------------------------------------------------------------------
// Buttons and links
// ---------------------------------------------------------------------------

const BUTTON_VARIANTS = {
  // The one ink fill — the single darkest control on a screen.
  primary: { background: color.ink, color: color.white, border: `1px solid ${color.ink}` },
  // The disclosure CTA — the one place accent is used as a fill.
  accent: { background: color.accent, color: color.white, border: `1px solid ${color.accent}` },
  // Bordered white — every non-primary action.
  secondary: { background: color.surfaceRaised, color: color.ink, border: `1px solid ${color.border}` },
  // Warm-derived destructive confirm (no red token in the palette).
  danger: { background: color.danger, color: color.white, border: `1px solid ${color.danger}` },
};

export function Button({ variant = 'secondary', full = false, large = false, style, className = '', children, ...rest }) {
  const v = BUTTON_VARIANTS[variant] || BUTTON_VARIANTS.secondary;
  const press = large ? 'cs-press-lg' : 'cs-press';
  return (
    <button
      className={`cs-focusable ${press} ${className}`.trim()}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        width: full ? '100%' : undefined,
        minHeight: 44,
        padding: full ? '17px' : '11px 15px',
        borderRadius: full ? radius.button + 2 : radius.button,
        fontSize: 16,
        fontWeight: 500,
        lineHeight: 1,
        cursor: rest.disabled ? 'not-allowed' : 'pointer',
        opacity: rest.disabled ? 0.55 : 1,
        transition: 'background-color 160ms ease, border-color 160ms ease, transform 160ms cubic-bezier(0.23,1,0.32,1)',
        ...v,
        ...style,
      }}
      {...rest}
    >
      {children}
    </button>
  );
}

// A quiet grey link (nav doors, back links). Renders an <a> or a <button>
// depending on whether an href is supplied.
export function QuietLink({ href, onClick, children, style, ...rest }) {
  const shared = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    color: color.textMuted,
    fontSize: 13,
    fontWeight: 400,
    padding: '10px 12px',
    borderRadius: radius.nav,
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    textDecoration: 'none',
    transition: 'background-color 160ms ease, color 160ms ease',
    ...style,
  };
  if (href) {
    return (
      <a className="cs-focusable" href={href} style={shared} {...rest}>
        {children}
      </a>
    );
  }
  return (
    <button className="cs-focusable" type="button" onClick={onClick} style={shared} {...rest}>
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Surfaces
// ---------------------------------------------------------------------------

export function Card({ as: Tag = 'div', raised = false, padding = 20, radius: r = radius.card, style, children, ...rest }) {
  return (
    <Tag
      style={{
        background: raised ? color.surfaceRaised : color.surface,
        border: `1px solid ${color.border}`,
        borderRadius: r,
        padding,
        ...style,
      }}
      {...rest}
    >
      {children}
    </Tag>
  );
}

// Accent-wash note with the inset accent dot. Used for the load-bearing
// reassurance sentences (enrolment, disclosure guarantee).
export function Note({ children, style, dotTop = 7, ...rest }) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 12,
        background: color.accentWash,
        borderRadius: radius.note,
        padding: 16,
        color: color.accentInk,
        fontSize: 14,
        lineHeight: 1.6,
        ...style,
      }}
      {...rest}
    >
      <span
        aria-hidden="true"
        style={{
          width: 8,
          height: 8,
          borderRadius: 999,
          background: color.accent,
          flex: 'none',
          marginTop: dotTop,
        }}
      />
      <div>{children}</div>
    </div>
  );
}

// A quiet recessed note (grey), for secondary explanatory copy.
export function QuietNote({ children, style, ...rest }) {
  return (
    <p
      style={{
        background: color.surfaceRecessed,
        border: `1px solid ${color.borderSubtle}`,
        borderRadius: radius.nested,
        padding: '12px 14px',
        margin: 0,
        color: color.textSecondary,
        fontSize: 13,
        lineHeight: 1.5,
        ...style,
      }}
      {...rest}
    >
      {children}
    </p>
  );
}

// ---------------------------------------------------------------------------
// Pills, badges, status dots
// ---------------------------------------------------------------------------

const PILL_TONES = {
  neutral: { background: color.surfaceSunken, color: color.textMuted },
  accent: { background: color.accentWash, color: color.accentText },
  success: { background: color.accentWash, color: color.success, backgroundOverride: '#e7f1ec' },
  warning: { background: '#f6efe2', color: color.warning },
};

export function Pill({ tone = 'neutral', children, style, ...rest }) {
  const t = PILL_TONES[tone] || PILL_TONES.neutral;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        background: t.backgroundOverride || t.background,
        color: t.color,
        borderRadius: radius.pill,
        padding: '4px 10px',
        fontSize: 11,
        fontWeight: 500,
        lineHeight: 1,
        whiteSpace: 'nowrap',
        ...style,
      }}
      {...rest}
    >
      {children}
    </span>
  );
}

const DOT_TONES = {
  success: color.success,
  accent: color.accent,
  warning: color.warning,
  muted: color.textMuted,
};

// Status dot — a filled circle, or (draft) a 1.5px ring with transparent fill.
export function StatusDot({ tone = 'muted', ring = false, size = 6 }) {
  const c = DOT_TONES[tone] || color.textMuted;
  return (
    <span
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        borderRadius: 999,
        flex: 'none',
        background: ring ? 'transparent' : c,
        border: ring ? `1.5px solid ${color.radioEmpty}` : 'none',
        display: 'inline-block',
      }}
    />
  );
}

export function Eyebrow({ as: Tag = 'div', children, style, ...rest }) {
  return (
    <Tag style={{ ...type.eyebrow, color: color.textMuted, margin: 0, ...style }} {...rest}>
      {children}
    </Tag>
  );
}

// ---------------------------------------------------------------------------
// Form controls
// ---------------------------------------------------------------------------

const controlBase = {
  width: '100%',
  minHeight: 44,
  height: 48,
  padding: '14px 15px',
  background: color.surfaceRaised,
  border: `1px solid ${color.border}`,
  borderRadius: radius.input,
  fontFamily: font,
  fontSize: 15,
  lineHeight: 1.4,
  color: color.textBody,
  boxSizing: 'border-box',
};

export function Input({ style, ...rest }) {
  return <input className="cs-focusable" style={{ ...controlBase, ...style }} {...rest} />;
}

export function Textarea({ style, ...rest }) {
  return (
    <textarea
      className="cs-focusable"
      style={{ ...controlBase, height: 'auto', minHeight: 96, resize: 'vertical', ...style }}
      {...rest}
    />
  );
}

// A native <select> with appearance:none and a supplied chevron (the design
// sets appearance:none but draws no chevron — we supply one as an SVG bg).
const CHEVRON =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'><path d='M1 1l5 5 5-5' fill='none' stroke='%2364686b' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/></svg>\")";

export function Select({ style, children, ...rest }) {
  return (
    <select
      className="cs-focusable"
      style={{
        ...controlBase,
        appearance: 'none',
        WebkitAppearance: 'none',
        MozAppearance: 'none',
        cursor: 'pointer',
        backgroundImage: CHEVRON,
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 15px center',
        paddingRight: 38,
        ...style,
      }}
      {...rest}
    >
      {children}
    </select>
  );
}

// Field label + optional "optional" hint, laid out with gap (never margins).
export function Field({ label, optional = false, htmlFor, children, style }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7, ...style }}>
      {label && (
        <label htmlFor={htmlFor} style={{ ...type.label, color: color.textBody, display: 'flex', gap: 6, alignItems: 'baseline' }}>
          {label}
          {optional && <span style={{ fontSize: 12, fontWeight: 400, color: color.textMutedAlt }}>optional</span>}
        </label>
      )}
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Metric grid (2a campaign card) — hairline effect via gap:1px over a subtle
// background, radius:11, overflow:hidden.
// ---------------------------------------------------------------------------

export function MetricGrid({ metrics }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${metrics.length}, minmax(0, 1fr))`,
        gap: 1,
        background: color.borderSubtle,
        border: `1px solid ${color.borderSubtle}`,
        borderRadius: radius.metric,
        overflow: 'hidden',
      }}
    >
      {metrics.map((m) => (
        <div key={m.label} style={{ background: color.surface, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 12, color: color.textMuted }}>{m.label}</span>
          <span data-tabular style={{ fontSize: 20, fontWeight: 500, color: color.ink, ...tabular }}>{m.value}</span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Overflow menu (··· more actions) — a real menu: roving items, Escape to
// close, click-outside to dismiss.
// ---------------------------------------------------------------------------

export function OverflowMenu({ label = 'more actions', items }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const visible = (items || []).filter(Boolean);

  useEffect(() => {
    if (!open) return undefined;
    function onDown(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    function onKey(e) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (visible.length === 0) return null;

  return (
    <span style={{ position: 'relative', display: 'inline-flex' }} ref={ref}>
      <button
        type="button"
        className="cs-focusable cs-press"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        style={{
          minHeight: 44,
          padding: '9px 12px',
          background: color.surfaceRaised,
          border: `1px solid ${color.border}`,
          borderRadius: radius.button,
          color: color.textMuted,
          fontSize: 15,
          fontWeight: 500,
          lineHeight: 1,
          cursor: 'pointer',
        }}
      >
        {'···'}
      </button>
      {open && (
        <div
          role="menu"
          style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            marginTop: 6,
            minWidth: 180,
            background: color.surfaceRaised,
            border: `1px solid ${color.border}`,
            borderRadius: radius.button,
            padding: 6,
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
            zIndex: 20,
          }}
        >
          {visible.map((item) => (
            <button
              key={item.label}
              role="menuitem"
              type="button"
              className="cs-focusable"
              onClick={() => {
                setOpen(false);
                item.onClick && item.onClick();
              }}
              style={{
                textAlign: 'left',
                padding: '10px 12px',
                borderRadius: radius.nav,
                background: 'transparent',
                border: 'none',
                color: item.tone === 'danger' ? color.danger : color.textBody,
                fontSize: 14,
                cursor: 'pointer',
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Press-and-hold confirm (2c) — the one deliberately resistant control.
//
// The resistance is the point: consent for covert-timing simulation of
// employees must not be grantable by a misplaced click, so the commit fires
// only after a full 1.6s hold (400ms under reduced motion). Release early and
// the fill resets and nothing is recorded. Pointer AND keyboard (Space/Enter)
// both drive it, and progress + completion are announced to screen readers via
// a live region so it is never a pointer-only gesture.
// ---------------------------------------------------------------------------

export function HoldToConfirm({
  onComplete,
  children,
  label = 'Press and hold to grant consent',
  busy = false,
  disabled = false,
}) {
  const [armed, setArmed] = useState(false);
  const [done, setDone] = useState(false);
  const timerRef = useRef(null);
  const liveRef = useRef(null);

  const durationMs = prefersReducedMotion() ? HOLD_MS_REDUCED : HOLD_MS;

  function clearTimer() {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }

  // Cancel on unmount so a released/aborted hold never fires late.
  useEffect(() => () => clearTimer(), []);

  function cancel() {
    if (done) return;
    clearTimer();
    setArmed(false);
    if (liveRef.current) liveRef.current.textContent = 'Hold cancelled.';
  }

  function complete() {
    clearTimer();
    setArmed(false);
    setDone(true);
    if (liveRef.current) liveRef.current.textContent = 'Consent confirmed.';
    onComplete && onComplete();
  }

  function start() {
    if (busy || disabled || done || armed) return;
    setArmed(true);
    if (liveRef.current) liveRef.current.textContent = 'Keep holding to confirm consent…';
    timerRef.current = setTimeout(complete, durationMs);
  }

  function onKeyDown(e) {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      start();
    }
  }
  function onKeyUp(e) {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      cancel();
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <button
        type="button"
        className="cs-focusable"
        disabled={busy || disabled}
        aria-label={label}
        // pointer + mouse both drive it; start() is idempotent while armed.
        onPointerDown={(e) => {
          if (e.currentTarget.setPointerCapture) {
            try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_e) { /* jsdom */ }
          }
          start();
        }}
        onPointerUp={cancel}
        onPointerLeave={() => armed && cancel()}
        onPointerCancel={cancel}
        onMouseDown={start}
        onMouseUp={cancel}
        onKeyDown={onKeyDown}
        onKeyUp={onKeyUp}
        style={{
          position: 'relative',
          overflow: 'hidden',
          minHeight: 48,
          padding: '15px 18px',
          width: '100%',
          borderRadius: radius.button,
          border: `1px solid ${color.ink}`,
          background: color.ink,
          color: color.white,
          fontSize: 16,
          fontWeight: 500,
          cursor: busy || disabled ? 'not-allowed' : 'pointer',
          opacity: busy || disabled ? 0.55 : 1,
          touchAction: 'none',
          userSelect: 'none',
        }}
      >
        {/* Accent progress fill: a CSS width transition, so the 1.6s (→400ms
            reduced) hold is expressed without a per-frame loop. */}
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: 0,
            width: armed ? '100%' : '0%',
            background: color.accent,
            opacity: 0.9,
            transition: `width ${armed ? durationMs : 120}ms linear`,
          }}
        />
        <span style={{ position: 'relative' }}>
          {busy ? 'Granting…' : done ? 'Consent granted' : armed ? 'Keep holding…' : children}
        </span>
      </button>
      <span ref={liveRef} role="status" aria-live="polite" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }} />
      <span aria-hidden="true" style={{ fontSize: 12, color: color.textMuted }}>
        Press and hold to grant. Release to cancel.
      </span>
    </div>
  );
}
