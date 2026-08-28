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

// A believable-but-plainly-fictional "account action required" lure. Realism is
// intentional (it is a simulation), but the framing stays generic so it reads
// as a training exercise once disclosed and never as a real brand's mail.
function renderSimulationEmail({ brandName, trackingUrl, pixelUrl } = {}) {
  const brand = escapeHtml(brandName || 'Staff Portal');
  const url = escapeHtml(trackingUrl || '#');

  const subject = `[${brandName || 'Staff Portal'}] Action required: verify your account`;

  const pixel = pixelUrl
    ? `<img src="${escapeHtml(pixelUrl)}" width="1" height="1" alt="" style="display:none" />`
    : '';

  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:24px;font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;background:#f4f5f7;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e2e4e8;border-radius:8px;">
      <tr>
        <td style="padding:24px 28px;">
          <h1 style="font-size:18px;margin:0 0 16px;">${brand}</h1>
          <p style="font-size:14px;line-height:1.5;margin:0 0 14px;">Hello,</p>
          <p style="font-size:14px;line-height:1.5;margin:0 0 14px;">
            We detected a sign-in to your account that needs to be confirmed.
            To keep your access active, please verify your account within
            24&nbsp;hours.
          </p>
          <p style="margin:24px 0;">
            <a href="${url}" style="background:#2b6cb0;color:#ffffff;text-decoration:none;padding:11px 20px;border-radius:6px;font-size:14px;display:inline-block;">Verify my account</a>
          </p>
          <p style="font-size:12px;line-height:1.5;color:#66707a;margin:0 0 6px;">
            If the button does not work, copy and paste this link into your browser:
          </p>
          <p style="font-size:12px;line-height:1.5;color:#66707a;margin:0 0 16px;word-break:break-all;">${url}</p>
          <p style="font-size:12px;line-height:1.5;color:#98a2ad;margin:0;">
            This is an automated message from the ${brand}.
          </p>
        </td>
      </tr>
    </table>
    ${pixel}
  </body>
</html>`;

  const text = [
    `${brandName || 'Staff Portal'}`,
    '',
    'Hello,',
    '',
    'We detected a sign-in to your account that needs to be confirmed. To keep',
    'your access active, please verify your account within 24 hours:',
    '',
    trackingUrl || '',
    '',
    `This is an automated message from the ${brandName || 'Staff Portal'}.`,
  ].join('\n');

  return { subject, html, text };
}

module.exports = { renderSimulationEmail };
