'use strict';

// Simulated phishing email template (Phase 5).
//
// This is the lure that carries the tracked link. Two hard constraints:
//
//  1. GENERIC / FICTIONAL ONLY. Like the Phase 4 landing page, the email must
//     never clone or impersonate a real brand (guardrail: no real-brand
//     impersonation). The brand string is a configurable placeholder.
//  2. The ONLY link is the tracked link. There is no form, no attachment, and
//     no place for the recipient to type anything — the "action" is a click,
//     which lands on the Phase 4 decoy page. Every path from here ends at the
//     disclosure page (guardrail #4, transparency).
//
// The template returns `{ subject, html, text }`. Both bodies are plain,
// self-contained markup with no remote resources beyond the single tracked
// link (an optional open-tracking pixel is appended by the caller only when it
// passes a `pixelUrl`).

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// A believable-but-plainly-fictional internal online-banking security notice.
// It is styled to resemble the kind of "verify your account" mail a staff
// banking portal would send (branded header bar, reference line, security
// footer) so the exercise is realistic — but the brand is a wholly FICTIONAL
// placeholder (guardrail #1: no real-brand impersonation) and there is still
// no form, no input and no attachment: the only action is the tracked click,
// which lands on the Phase 4 decoy page.
function renderSimulationEmail({ brandName, trackingUrl, pixelUrl } = {}) {
  const brandPlain = brandName || 'Staff Portal';
  const brand = escapeHtml(brandPlain);
  const url = escapeHtml(trackingUrl || '#');

  const subject = `[${brandPlain}] Action required: verify your online banking access`;

  const pixel = pixelUrl
    ? `<img src="${escapeHtml(pixelUrl)}" width="1" height="1" alt="" style="display:none" />`
    : '';

  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:24px;font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;background:#eef1f5;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #d8dde4;border-radius:8px;overflow:hidden;">
      <tr>
        <td style="background:#0b2545;padding:18px 28px;">
          <span style="color:#ffffff;font-size:17px;font-weight:bold;letter-spacing:0.3px;">${brand}</span>
          <span style="color:#9fb3c8;font-size:11px;display:block;margin-top:2px;">Online Banking &middot; Secure Message</span>
        </td>
      </tr>
      <tr>
        <td style="padding:24px 28px;">
          <p style="font-size:12px;line-height:1.5;color:#66707a;margin:0 0 16px;">Reference: ONB-4471-VERIFY</p>
          <p style="font-size:14px;line-height:1.5;margin:0 0 14px;">Dear Colleague,</p>
          <p style="font-size:14px;line-height:1.5;margin:0 0 14px;">
            As part of a routine security review, we detected a sign-in to your
            online banking profile that could not be automatically verified. To
            keep your access active and protect your account, please confirm
            your profile within <strong>24&nbsp;hours</strong>.
          </p>
          <p style="margin:24px 0;">
            <a href="${url}" style="background:#0b6b3a;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:6px;font-size:14px;font-weight:bold;display:inline-block;">Verify my account</a>
          </p>
          <p style="font-size:12px;line-height:1.5;color:#66707a;margin:0 0 6px;">
            If the button does not work, copy and paste this link into your browser:
          </p>
          <p style="font-size:12px;line-height:1.5;color:#66707a;margin:0 0 4px;word-break:break-all;">${url}</p>
        </td>
      </tr>
      <tr>
        <td style="background:#f4f6f9;border-top:1px solid #e2e4e8;padding:16px 28px;">
          <p style="font-size:11px;line-height:1.5;color:#8a95a1;margin:0 0 6px;">
            This is an automated security notification from the ${brand}. Please do
            not reply to this message.
          </p>
          <p style="font-size:11px;line-height:1.5;color:#8a95a1;margin:0;">
            ${brand} will never ask you to share your password, PIN or one-time
            code by email. If you did not expect this message, contact your
            security team.
          </p>
        </td>
      </tr>
    </table>
    ${pixel}
  </body>
</html>`;

  const text = [
    `${brandPlain}`,
    'Online Banking - Secure Message',
    '',
    'Reference: ONB-4471-VERIFY',
    '',
    'Dear Colleague,',
    '',
    'As part of a routine security review, we detected a sign-in to your online',
    'banking profile that could not be automatically verified. To keep your',
    'access active, please confirm your profile within 24 hours:',
    '',
    trackingUrl || '',
    '',
    `This is an automated security notification from the ${brandPlain}. Please do`,
    'not reply to this message. We will never ask you to share your password,',
    'PIN or one-time code by email.',
  ].join('\n');

  return { subject, html, text };
}

// Phase 8 — enrollment notification email.
//
// Sent AFTER a participant has already been disclosed the simulation (guardrail
// #4). Its tone is deliberately supportive and NON-PUNITIVE (guardrail #6 /
// PRD ethics): this is an invitation to a short awareness lesson, not a
// reprimand. The only link is the tokened training link, which lets the
// participant reach and complete their assigned module without an account. The
// brand string is the same generic/fictional placeholder used elsewhere.
function renderEnrollmentEmail({ brandName, trainingUrl, moduleTitle } = {}) {
  const brand = escapeHtml(brandName || 'Security Awareness');
  const url = escapeHtml(trainingUrl || '#');
  const title = escapeHtml(moduleTitle || 'a short awareness lesson');
  const titlePlain = moduleTitle || 'a short awareness lesson';

  const subject = `[${brandName || 'Security Awareness'}] Your quick security awareness training`;

  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:24px;font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;background:#f4f5f7;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e2e4e8;border-radius:8px;">
      <tr>
        <td style="padding:24px 28px;">
          <h1 style="font-size:18px;margin:0 0 16px;">${brand}</h1>
          <p style="font-size:14px;line-height:1.5;margin:0 0 14px;">Hello,</p>
          <p style="font-size:14px;line-height:1.5;margin:0 0 14px;">
            You recently took part in a phishing simulation. This kind of thing
            happens to careful people every day — there is no penalty and nothing
            you typed was captured or stored. To help you spot the next one, we
            have enrolled you in a short lesson: <strong>${title}</strong>.
          </p>
          <p style="margin:24px 0;">
            <a href="${url}" style="background:#2b6cb0;color:#ffffff;text-decoration:none;padding:11px 20px;border-radius:6px;font-size:14px;display:inline-block;">Start my training</a>
          </p>
          <p style="font-size:12px;line-height:1.5;color:#66707a;margin:0 0 6px;">
            If the button does not work, copy and paste this link into your browser:
          </p>
          <p style="font-size:12px;line-height:1.5;color:#66707a;margin:0 0 16px;word-break:break-all;">${url}</p>
          <p style="font-size:12px;line-height:1.5;color:#98a2ad;margin:0;">
            It only takes a few minutes. Thank you for helping keep everyone safer.
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = [
    `${brandName || 'Security Awareness'}`,
    '',
    'Hello,',
    '',
    'You recently took part in a phishing simulation. This happens to careful',
    'people every day — there is no penalty and nothing you typed was captured',
    'or stored. To help you spot the next one, we have enrolled you in a short',
    `lesson: ${titlePlain}.`,
    '',
    'Start your training:',
    trainingUrl || '',
    '',
    'It only takes a few minutes. Thank you for helping keep everyone safer.',
  ].join('\n');

  return { subject, html, text };
}

module.exports = { renderSimulationEmail, renderEnrollmentEmail };
