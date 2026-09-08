import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fluid, layout, type } from './theme.js';

// Read as text, not imported: the Vitest config sets `css: false`, which stubs
// every stylesheet import (including `?raw`) out to nothing. The sheet is never
// applied in jsdom, but its source is exactly what these tests need in order to
// check that the JS and CSS copies of a token still agree.
const css = readFileSync(resolve(process.cwd(), 'src/styles/global.css'), 'utf8');

// The design tokens are the one thing in the app that is deliberately written
// down twice — once here in JS for inline styles, once in global.css for the
// rules that need a media query. These tests hold the two copies together and
// pin the shape of the fluid scale, which is easy to get subtly wrong by hand
// (it already shipped once with half the intended slope).

describe('fluid', () => {
  it('is exactly the mobile value at the drawn 390px width', () => {
    // clamp()'s floor is the mobile value, so the design as drawn is untouched.
    expect(fluid(16, 24)).toMatch(/^clamp\(16px,/);
  });

  it('is exactly the desktop value at the 1280px ceiling', () => {
    expect(fluid(16, 24)).toMatch(/, 24px\)$/);
  });

  it('interpolates so the preferred term hits both ends', () => {
    const m = /^clamp\(\d+px, (-?[\d.]+)px \+ ([\d.]+)vw, \d+px\)$/.exec(fluid(20, 40));
    expect(m).not.toBeNull();
    const at = (vw) => Number(m[1]) + (Number(m[2]) / 100) * vw;
    expect(at(390)).toBeCloseTo(20, 1);
    expect(at(1280)).toBeCloseTo(40, 1);
  });

  it('does not scale when both ends are equal', () => {
    expect(fluid(13, 13)).toBe('clamp(13px, 13.00px + 0.000vw, 13px)');
  });
});

describe('token mirroring into global.css', () => {
  it('--cs-gutter matches layout.gutter', () => {
    const m = /--cs-gutter:\s*([^;]+);/.exec(css);
    expect(m).not.toBeNull();
    expect(m[1].trim()).toBe(layout.gutter);
  });

  it('the shell width caps match the layout tokens', () => {
    // `--page` and `--lesson` are declared twice: the shared narrow cap, then
    // the desktop cap inside the min-width:1024px block.
    expect(css).toContain(`max-width: ${layout.prose}px;`);
    expect(css).toContain(`max-width: ${layout.page}px;`);
    expect(css).toContain(`max-width: ${layout.lesson}px;`);
    expect(css).toContain(`max-width: ${layout.library}px;`);
    expect(css).toContain(`max-width: ${layout.column}px;`);
  });

  it('the learning-site breakpoint matches layout.desktopMin', () => {
    expect(css).toContain(`@media (min-width: ${layout.desktopMin}px)`);
  });

  it('the desktop rail column matches layout.rail', () => {
    expect(css).toContain(`grid-template-columns: ${layout.rail}px minmax(0, 1fr);`);
  });

  it('the console nav rail, drawer and breakpoint match the layout tokens', () => {
    // The console's nav is one piece of markup in two shapes, and the sheet is
    // the only place the switch between them is written down — so the rail
    // width, the drawer width and the breakpoint all have to keep agreeing with
    // the tokens the JS side reads (AdminConsole watches the same breakpoint
    // through matchMedia).
    expect(css).toContain(`width: ${layout.consoleRail}px;`);
    expect(css).toContain(`width: min(${layout.consoleNav}px, 84vw);`);
    // Below the breakpoint, exclusive of it: the rail owns consoleNavMin itself.
    expect(css).toContain(`@media (max-width: ${layout.consoleNavMin - 0.02}px)`);
  });
});

describe('the type scale', () => {
  it('scales the reading roles and leaves small UI text fixed', () => {
    for (const role of ['display', 'pageTitle', 'lessonH1', 'consoleH2', 'lead', 'body']) {
      expect(type[role].fontSize, role).toMatch(/^clamp\(/);
    }
    // 12px is 12px on any screen — scaling chrome only makes it shout.
    for (const role of ['meta', 'label', 'eyebrow', 'pill']) {
      expect(typeof type[role].fontSize, role).toBe('number');
    }
  });

  it('never shrinks a role below the size it was drawn at', () => {
    const drawn = { display: 34, pageTitle: 28, lessonH1: 27, consoleH2: 24, lead: 16, body: 15 };
    for (const [role, px] of Object.entries(drawn)) {
      expect(type[role].fontSize, role).toMatch(new RegExp(`^clamp\\(${px}px,`));
    }
  });
});
