'use strict';

// Email template tests (Phase 5). The lure must embed the tracked link, must be
// generic/fictional (no real-brand impersonation), and must contain no form or
// input where a recipient could type a credential — the only action is a click.

const { renderSimulationEmail } = require('../src/views/emailTemplates');

const BRAND = 'ACME Corp — Staff Portal';
const TRACK = 'https://sim.example.test/t/abc123';
const PIXEL = 'https://sim.example.test/t/abc123/pixel.gif';

describe('renderSimulationEmail', () => {
  test('returns subject + html + text', () => {
    const mail = renderSimulationEmail({ brandName: BRAND, trackingUrl: TRACK });
    expect(mail.subject).toContain(BRAND);
    expect(typeof mail.html).toBe('string');
    expect(typeof mail.text).toBe('string');
  });

  test('embeds the tracking link in both bodies', () => {
    const mail = renderSimulationEmail({ brandName: BRAND, trackingUrl: TRACK });
    expect(mail.html).toContain(TRACK);
    expect(mail.text).toContain(TRACK);
  });

  test('has no form or input — the only action is the tracked click', () => {
    const mail = renderSimulationEmail({ brandName: BRAND, trackingUrl: TRACK });
    expect(mail.html).not.toMatch(/<form/i);
    expect(mail.html).not.toMatch(/<input/i);
    expect(mail.html).not.toMatch(/type=["']password["']/i);
  });

  test('appends the open-tracking pixel only when a pixelUrl is provided', () => {
    const withPixel = renderSimulationEmail({ brandName: BRAND, trackingUrl: TRACK, pixelUrl: PIXEL });
    expect(withPixel.html).toContain(PIXEL);
    const without = renderSimulationEmail({ brandName: BRAND, trackingUrl: TRACK });
    expect(without.html).not.toContain('pixel.gif');
  });

  test('escapes a hostile brand/token so it cannot break out of markup', () => {
    const mail = renderSimulationEmail({
      brandName: '<script>x</script>',
      trackingUrl: 'https://x/t/"><script>evil</script>',
    });
    expect(mail.html).not.toContain('<script>x</script>');
    expect(mail.html).not.toContain('<script>evil</script>');
  });
});
