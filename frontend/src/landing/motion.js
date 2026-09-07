import { useEffect, useRef } from 'react';

// Motion plumbing for the landing surface.
//
// Two rules shape everything here:
//
//   1. NOTHING ANIMATES THROUGH REACT. Scroll position and cursor position
//      change at frame rate; routing either of them through useState would
//      re-render the whole page 60 times a second to move a gradient. Both are
//      written straight to the DOM as custom properties and CSS does the rest.
//   2. NO ANIMATION MAY HIDE CONTENT. Every entrance starts from opacity 0, so
//      if the mechanism is missing (no IntersectionObserver, reduced motion,
//      JS disabled mid-hydration) the fallback must reveal, never conceal.

// True when the visitor has asked their OS for less motion. Read at call time
// rather than cached, so changing the setting is honoured on the next mount.
// jsdom implements no matchMedia at all, which is why the typeof guard is here
// and not just a truthiness check.
export function reducedMotion() {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

// Scroll-reveal. One observer for the whole page rather than one per element:
// anything inside the root carrying [data-reveal] gets [data-revealed] the
// first time it enters the viewport, and the CSS transition (with its per-item
// --d stagger) does the animating.
//
// Reveals are one-way on purpose. Re-hiding a section when it scrolls back off
// makes a page feel like it is fighting you, and it breaks Cmd-F.
export function useReveal(rootRef) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;

    const targets = Array.from(root.querySelectorAll('[data-reveal]'));
    const revealAll = () => targets.forEach((el) => el.setAttribute('data-revealed', ''));

    if (reducedMotion() || typeof IntersectionObserver !== 'function') {
      revealAll();
      return undefined;
    }

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.setAttribute('data-revealed', '');
          io.unobserve(entry.target);
        }
      },
      // A negative bottom margin means a block reveals once it is properly on
      // screen, not the instant one pixel of it clears the fold.
      { threshold: 0.08, rootMargin: '0px 0px -12% 0px' }
    );

    targets.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [rootRef]);
}

// Drives two pieces of chrome from one scroll listener: the progress bar's
// scaleX (as --l-scroll on the page root) and the nav's [data-stuck] state.
// rAF-coalesced, so a burst of scroll events still costs one write per frame.
export function useScrollChrome(rootRef, navRef) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof window === 'undefined') return undefined;

    let frame = 0;

    const apply = () => {
      frame = 0;
      const doc = document.documentElement;
      const scrollable = doc.scrollHeight - window.innerHeight;
      const y = window.scrollY || doc.scrollTop || 0;
      const progress = scrollable > 0 ? Math.min(1, Math.max(0, y / scrollable)) : 0;
      root.style.setProperty('--l-scroll', String(progress));

      const nav = navRef.current;
      if (nav) {
        // 12px rather than 0: the nav should not flicker its background on the
        // one-pixel overscroll a trackpad produces at rest.
        if (y > 12) nav.setAttribute('data-stuck', '');
        else nav.removeAttribute('data-stuck');
      }
    };

    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(apply);
    };

    apply();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [rootRef, navRef]);
}

// Cursor spotlight. Writes the pointer's position within each `.l-spot` card as
// --mx/--my percentages; the card's ::after paints a radial glow there. Bound
// once on the page root by delegation, so adding a card later needs no wiring.
//
// Skipped entirely for coarse pointers: there is no cursor to follow on a
// phone, and the listener would just be work.
export function useSpotlight(rootRef) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof window === 'undefined') return undefined;
    if (reducedMotion()) return undefined;
    if (typeof window.matchMedia === 'function' && !window.matchMedia('(hover: hover)').matches) {
      return undefined;
    }

    const onMove = (event) => {
      const card = event.target instanceof Element ? event.target.closest('.l-spot') : null;
      if (!card) return;
      const box = card.getBoundingClientRect();
      card.style.setProperty('--mx', `${((event.clientX - box.left) / box.width) * 100}%`);
      card.style.setProperty('--my', `${((event.clientY - box.top) / box.height) * 100}%`);
    };

    root.addEventListener('pointermove', onMove, { passive: true });
    return () => root.removeEventListener('pointermove', onMove);
  }, [rootRef]);
}

// A number that counts up the first time it is scrolled into view.
//
// It writes textContent directly for the same reason as above — a 900ms count
// is ~54 renders of a subtree that only needs its text swapped — and it starts
// from the observer rather than on mount, so the count is something the visitor
// watches happen rather than something already over when they arrive.
export function useCountUp(rootRef) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;

    const targets = Array.from(root.querySelectorAll('[data-count]'));
    if (targets.length === 0) return undefined;

    const format = (el, value) =>
      `${el.dataset.prefix || ''}${Math.round(value).toLocaleString()}${el.dataset.suffix || ''}`;

    const settle = (el) => {
      el.textContent = format(el, Number(el.dataset.count));
    };

    if (reducedMotion() || typeof IntersectionObserver !== 'function') {
      targets.forEach(settle);
      return undefined;
    }

    targets.forEach((el) => {
      el.textContent = format(el, 0);
    });

    const running = new Set();

    const run = (el) => {
      const to = Number(el.dataset.count);
      if (!Number.isFinite(to)) return settle(el);
      const duration = 1100;
      const start = performance.now();
      const tick = (now) => {
        const t = Math.min(1, (now - start) / duration);
        // Ease-out quart: fast off the mark, then a long settle, which is what
        // makes a counter read as "landing on" a number.
        el.textContent = format(el, to * (1 - Math.pow(1 - t, 4)));
        if (t < 1) window.requestAnimationFrame(tick);
        else running.delete(el);
      };
      running.add(el);
      window.requestAnimationFrame(tick);
      return undefined;
    };

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          io.unobserve(entry.target);
          run(entry.target);
        }
      },
      { threshold: 0.5 }
    );

    targets.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [rootRef]);
}

// One call that wires the whole surface, so the page component stays a
// description of what is on screen rather than a pile of effects.
export function useLandingMotion() {
  const rootRef = useRef(null);
  const navRef = useRef(null);
  useReveal(rootRef);
  useScrollChrome(rootRef, navRef);
  useSpotlight(rootRef);
  useCountUp(rootRef);
  return { rootRef, navRef };
}
