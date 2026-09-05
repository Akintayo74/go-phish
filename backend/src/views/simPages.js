'use strict';

// Server-rendered HTML for the Phase 4 simulation pages.
//
// WHY SERVER-RENDERED (and not a React page): the simulated login page and its
// dummy form are the single highest-sensitivity component in the system. Serving
// them from the backend keeps the form and the handler that discards its values
// in one auditable place, with no client-side code that could stash a typed
// value in state, storage, or an outbound request. The pages are fully static
// HTML with a small inline stylesheet and NO JavaScript and NO external
// resources* — nothing runs in the participant's browser that could exfiltrate a
// keystroke. (*The disclosure page, and ONLY the disclosure page, links a web
// font; the decoy loads nothing external.)
//
// TWO PAGES, TWO DESIGN LANGUAGES — this split is deliberate:
//
//   • The LANDING page (screen 2g, the decoy) is a GENERIC, FICTIONAL corporate
//     sign-in page. It must NEVER clone or impersonate a real brand (guardrail:
//     no real-brand impersonation) AND it must NEVER adopt the CAT-Sim design
//     system — see the do-not-restyle notice above renderLandingPage. A
//     participant who recognises the house style before submitting invalidates
//     the measurement.
//
//   • The DISCLOSURE page (screen 2f) IS the CAT-Sim design system — it is the
//     emotional centre of the product and its whole job is relief. It is styled
//     with the "Civic" tokens (Instrument Sans, the accent, warm neutrals, 14px
//     radii, no shadows, the one accent-filled CTA).
//
// Every submission ends at the disclosure page (guardrail #4, transparency).

// Minimal HTML-escape for any value interpolated into markup. The only dynamic
// value here is the routing token (placed into URLs), but we escape defensively
// so a hostile token can never break out of an attribute or inject markup.
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ---------------------------------------------------------------------------
// DECOY (screen 2g) — DO NOT RESTYLE.
//
// These styles are intentionally generic, unremarkable, and house-style-free.
// They must NOT resemble CAT-Sim in any way: no wordmark, no accent (#3f4bbd),
// no Instrument Sans, no 14px radii, no motion. If a developer "fixes" this page
// for visual consistency with the rest of the app, the research data becomes
// worthless — a target who spots the design system before submitting is no
// longer being measured. Leave it exactly as it is.
// ---------------------------------------------------------------------------
const DECOY_STYLES = `
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #eef1f6;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica,
      Arial, sans-serif;
    color: #1c2430;
    padding: 24px;
  }
  .card {
    background: #ffffff;
    width: 100%;
    max-width: 400px;
    border-radius: 10px;
    box-shadow: 0 8px 30px rgba(20, 30, 50, 0.12);
    padding: 32px 28px;
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 22px;
  }
  .brand .mark {
    width: 34px;
    height: 34px;
    border-radius: 8px;
    background: linear-gradient(135deg, #2f6fed, #1e46b8);
    flex: none;
  }
  .brand .name { font-weight: 700; font-size: 16px; letter-spacing: 0.2px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  p.sub { margin: 0 0 22px; color: #5a6675; font-size: 14px; }
  label { display: block; font-size: 13px; font-weight: 600; margin: 14px 0 6px; }
  input[type="text"], input[type="password"] {
    width: 100%;
    padding: 11px 12px;
    border: 1px solid #ccd3de;
    border-radius: 7px;
    font-size: 15px;
  }
  input:focus { outline: 2px solid #2f6fed; border-color: #2f6fed; }
  button {
    width: 100%;
    margin-top: 22px;
    padding: 12px;
    border: 0;
    border-radius: 7px;
    background: #2f6fed;
    color: #fff;
    font-size: 15px;
    font-weight: 600;
    cursor: pointer;
  }
  button:hover { background: #245bd1; }
  .foot { margin-top: 18px; font-size: 12px; color: #8a94a3; text-align: center; }
`;

// ---------------------------------------------------------------------------
// DISCLOSURE (screen 2f) — the CAT-Sim "Civic" design system.
//
// Tokens ported from the design handoff. There are NO shadows anywhere; depth is
// the background ramp plus 1px borders. The accent (#3f4bbd) is used as a fill on
// exactly one element — the CTA — because this is the one screen where the next
// action is an invitation, not an instruction. Entrances use the omRise
// keyframe on a 60ms stagger, and prefers-reduced-motion resolves them instantly.
// ---------------------------------------------------------------------------
const DISCLOSURE_STYLES = `
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    min-height: 100vh;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    background: #f7f7f5;
    font-family: 'Instrument Sans', system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
    color: #33373a;
    padding: 34px 30px;
    -webkit-font-smoothing: antialiased;
  }
  .disc {
    width: 100%;
    max-width: 560px;
    background: #fcfcfb;
    border: 1px solid #ececea;
    border-radius: 18px;
    padding: 30px 28px;
    display: flex;
    flex-direction: column;
    gap: 22px;
  }
  .rise { animation: omRise 400ms cubic-bezier(0.23, 1, 0.32, 1) both; }
  @keyframes omRise {
    from { opacity: 0; transform: translateY(10px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  .eyebrow {
    align-self: flex-start;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: #eef0fb;
    color: #4b55a8;
    border-radius: 999px;
    padding: 8px 12px;
    font-size: 12px;
    font-weight: 500;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  .eyebrow .dot { width: 6px; height: 6px; border-radius: 999px; background: #3f4bbd; }
  h1 {
    margin: 0;
    font-size: 34px;
    line-height: 1.1;
    font-weight: 500;
    letter-spacing: -0.032em;
    color: #16171a;
    text-wrap: balance;
  }
  .lede { margin: 12px 0 0; font-size: 16px; line-height: 1.6; color: #55595c; }
  .note {
    display: flex;
    gap: 12px;
    background: #eef0fb;
    border-radius: 14px;
    padding: 18px;
    color: #24284a;
    font-size: 16px;
    line-height: 1.6;
  }
  .note .dot { width: 8px; height: 8px; border-radius: 999px; background: #3f4bbd; flex: none; margin-top: 8px; }
  .note strong { font-weight: 600; }
  .habits-intro { margin: 0; font-size: 16px; line-height: 1.6; color: #33373a; }
  .habits {
    list-style: none;
    margin: 12px 0 0;
    padding: 6px;
    background: #f1f2ef;
    border-radius: 14px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    counter-reset: habit;
  }
  .habits li {
    display: flex;
    gap: 10px;
    align-items: baseline;
    background: #fcfcfb;
    border-radius: 10px;
    padding: 13px 14px;
    font-size: 15px;
    line-height: 1.5;
    color: #33373a;
  }
  .habits li::before {
    counter-increment: habit;
    content: counter(habit, decimal-leading-zero);
    color: #3f4bbd;
    font-size: 13px;
    font-weight: 500;
    font-variant-numeric: tabular-nums;
    flex: none;
  }
  .cta {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    text-decoration: none;
    background: #3f4bbd;
    border-radius: 14px;
    padding: 19px 22px;
    transition: background-color 160ms ease, transform 160ms cubic-bezier(0.23, 1, 0.32, 1);
  }
  .cta:hover { background: #333ea8; }
  .cta:active { transform: scale(0.985); }
  .cta .label { color: #fff; font-size: 17px; line-height: 1.2; font-weight: 500; letter-spacing: -0.015em; }
  .cta .sub { color: #d5d9f4; font-size: 13px; line-height: 1.3; margin-top: 3px; }
  .cta .arrow { color: #fff; font-size: 18px; flex: none; }
  @media (prefers-reduced-motion: reduce) {
    .rise { animation: none; opacity: 1; transform: none; }
    .cta:active { transform: none; }
  }
`;

// `head` lets the disclosure page add its font <link>s; the decoy passes none so
// it loads nothing external.
function page({ title, body, styles, head = '' }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${escapeHtml(title)}</title>
${head}
<style>${styles}</style>
</head>
<body>
${body}
</body>
</html>`;
}

// The fictional sign-in page carrying the dummy form. `actionPath` is where the
// form POSTs; the handler there discards every field (see routes/sim.js).
// DO NOT restyle — see the decoy notice above.
function renderLandingPage({ brandName, actionPath }) {
  const brand = escapeHtml(brandName);
  const action = escapeHtml(actionPath);
  const body = `
  <main class="card">
    <div class="brand">
      <div class="mark" aria-hidden="true"></div>
      <div class="name">${brand}</div>
    </div>
    <h1>Sign in</h1>
    <p class="sub">Use your staff account to continue.</p>
    <form method="post" action="${action}" autocomplete="off">
      <label for="username">Username or email</label>
      <input id="username" name="username" type="text" autocomplete="off" required>
      <label for="password">Password</label>
      <input id="password" name="password" type="password" autocomplete="off" required>
      <button type="submit">Sign in</button>
    </form>
    <div class="foot">Having trouble? Contact your IT service desk.</div>
  </main>`;
  return page({ title: `${brandName} — Sign in`, body, styles: DECOY_STYLES });
}

// Shown after any submission (screen 2f, guardrail #4). Reassurance precedes
// explanation: the headline names the simulation AND says the participant is
// fine in the same breath, and the guarantee that nothing typed was captured
// comes before the habits. This copy is load-bearing and must stay literally
// true in code — the POST handler (routes/sim.js) never reads req.body, so there
// is no field that can hold a username or password. If that ever changes, this
// copy must change with it.
function renderDisclosurePage({ brandName, trainingUrl }) {
  // brandName is intentionally not shown here — the disclosure is about the
  // programme, not the decoy's fictional brand. It stays in the signature for
  // call-site symmetry with the landing page.
  void brandName;
  const training = escapeHtml(trainingUrl);
  const fontHead =
    '<link rel="preconnect" href="https://fonts.googleapis.com">' +
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' +
    '<link href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600&display=swap" rel="stylesheet">';
  const body = `
  <main class="disc">
    <span class="eyebrow rise" style="animation-delay:0ms"><span class="dot" aria-hidden="true"></span>Security awareness simulation</span>
    <div class="rise" style="animation-delay:60ms">
      <h1>That was a phishing simulation &mdash; and you are fine.</h1>
      <p class="lede">
        The sign-in page you just used was not real. It was part of an authorised awareness
        exercise run by your organisation.
      </p>
    </div>
    <div class="note rise" style="animation-delay:120ms">
      <span class="dot" aria-hidden="true"></span>
      <div>
        <strong>Nothing you typed was captured or stored.</strong> The system has no field able to
        hold a username or password &mdash; the values were discarded the moment they arrived. All
        that was recorded is that a simulated form was submitted.
      </div>
    </div>
    <div class="rise" style="animation-delay:180ms">
      <p class="habits-intro">
        There is no penalty, and no one will be told it was you. Real attackers use pages exactly
        like that one. Four habits that catch most of them:
      </p>
      <ol class="habits">
        <li>Read the sender&rsquo;s real address, not the display name.</li>
        <li>Treat urgency as the warning sign it is.</li>
        <li>Type important sites in yourself instead of following links.</li>
        <li>When unsure, call the IT service desk before entering anything.</li>
      </ol>
    </div>
    <a class="cta rise" style="animation-delay:240ms" href="${training}">
      <span>
        <span class="label">Take the 6-minute lesson</span>
        <span class="sub">Recognizing a phishing attempt</span>
      </span>
      <span class="arrow" aria-hidden="true">&rarr;</span>
    </a>
  </main>`;
  return page({ title: 'Phishing simulation — disclosure', body, styles: DISCLOSURE_STYLES, head: fontHead });
}

module.exports = { renderLandingPage, renderDisclosurePage, escapeHtml };
