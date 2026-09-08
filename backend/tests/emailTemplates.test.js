'use strict';

// Email template tests (Phase 5). The lure must embed the tracked link, must be
// generic/fictional (no real-brand impersonation), and must contain no form or
// input where a recipient could type a credential — the only action is a click.

const { renderSimulationEmail, renderEnrollmentEmail } = require('../src/views/emailTemplates');

const BRAND = 'Meridian Trust Bank — Staff Portal';
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

// Phase 8 — the enrollment notification email.
describe('renderEnrollmentEmail', () => {
  const TRAIN = 'https://sim.example.test/#/enroll/ctok123';

  test('embeds the tokened training link and the module title in both bodies', () => {
    const mail = renderEnrollmentEmail({
      brandName: BRAND,
      trainingUrl: TRAIN,
      moduleTitle: 'Recognizing Phishing',
    });
    expect(mail.subject).toContain(BRAND);
    expect(mail.html).toContain(TRAIN);
    expect(mail.text).toContain(TRAIN);
    expect(mail.html).toContain('Recognizing Phishing');
  });

  test('is supportive/non-punitive and reassures nothing was captured', () => {
    const mail = renderEnrollmentEmail({ brandName: BRAND, trainingUrl: TRAIN });
    expect(mail.html).toMatch(/no penalty|nothing you typed/i);
    // No blame/threat language.
    expect(mail.html).not.toMatch(/failed|punish|disciplin/i);
  });

  test('has no form or input — the only action is the training link', () => {
    const mail = renderEnrollmentEmail({ brandName: BRAND, trainingUrl: TRAIN });
    expect(mail.html).not.toMatch(/<form/i);
    expect(mail.html).not.toMatch(/<input/i);
  });

  test('escapes a hostile brand/title/url so it cannot break out of markup', () => {
    const mail = renderEnrollmentEmail({
      brandName: '<script>x</script>',
      trainingUrl: 'https://x/#/enroll/"><script>evil</script>',
      moduleTitle: '<script>t</script>',
    });
    expect(mail.html).not.toContain('<script>x</script>');
    expect(mail.html).not.toContain('<script>evil</script>');
    expect(mail.html).not.toContain('<script>t</script>');
  });
});
