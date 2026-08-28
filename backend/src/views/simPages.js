'use strict';

// Server-rendered HTML for the Phase 4 simulation pages.
//
// WHY SERVER-RENDERED (and not a React page): the simulated login page and its
// dummy form are the single highest-sensitivity component in the system. Serving
// them from the backend keeps the form and the handler that discards its values
// in one auditable place, with no client-side code that could stash a typed
// value in state, storage, or an outbound request. The pages are fully static
// HTML with a small inline stylesheet and NO JavaScript and NO external
// resources — nothing runs in the participant's browser that could exfiltrate a
// keystroke.
//
// The landing page is a GENERIC, FICTIONAL corporate sign-in page. It must never
// clone or impersonate a real brand (guardrail: no real-brand impersonation);
// the brand string is a configurable placeholder. Realism is intentional (it is
// a simulation), but every submission ends at the disclosure page (guardrail #4,
// transparency).

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

const BASE_STYLES = `
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
  .disc { max-width: 560px; text-align: left; }
  .disc h1 { font-size: 22px; margin-bottom: 12px; }
  .disc .badge {
    display: inline-block;
    background: #fdecec;
    color: #b3261e;
    font-weight: 700;
    font-size: 12px;
    letter-spacing: 0.4px;
    padding: 6px 10px;
    border-radius: 999px;
    margin-bottom: 16px;
  }
  .disc p { line-height: 1.55; color: #2a3441; font-size: 15px; }
  .disc ul { line-height: 1.6; color: #2a3441; font-size: 15px; padding-left: 20px; }
  .disc .cta {
    display: inline-block;
    margin-top: 18px;
    padding: 11px 18px;
    background: #1a7f4b;
    color: #fff;
    text-decoration: none;
    border-radius: 7px;
    font-weight: 600;
  }
`;

function page({ title, body }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${escapeHtml(title)}</title>
<style>${BASE_STYLES}</style>
</head>
<body>
${body}
</body>
</html>`;
}

// The fictional sign-in page carrying the dummy form. `actionPath` is where the
// form POSTs; the handler there discards every field (see routes/sim.js).
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
  return page({ title: `${brandName} — Sign in`, body });
}

// Shown after any submission (guardrail #4). It reveals the simulation, states
// plainly that nothing typed was captured, avoids punitive framing, and points
// to the awareness training.
function renderDisclosurePage({ brandName, trainingUrl }) {
  const brand = escapeHtml(brandName);
  const training = escapeHtml(trainingUrl);
  const body = `
  <main class="card disc">
    <span class="badge">SECURITY AWARENESS SIMULATION</span>
    <h1>This was a phishing simulation</h1>
    <p>
      The sign-in page you just used was <strong>not real</strong>. It was part
      of an authorized cybersecurity awareness exercise run by your organization
      to help everyone practise spotting phishing attempts. The
      &ldquo;${brand}&rdquo; page was a decoy.
    </p>
    <p>
      <strong>Nothing you typed was captured or stored.</strong> This system is
      built so that it is impossible for it to record a username or password — the
      form values are discarded the moment they arrive. We only note, in
      aggregate, that a simulated form was submitted.
    </p>
    <p>
      There is no penalty here. Real attackers use pages exactly like that one,
      so this is simply a chance to learn. A few habits that help:
    </p>
    <ul>
      <li>Check the sender and the link's real address before you click.</li>
      <li>Be wary of urgency (&ldquo;act now,&rdquo; &ldquo;account suspended&rdquo;).</li>
      <li>Type important sites in yourself instead of following email links.</li>
      <li>When unsure, contact your IT service desk before entering anything.</li>
    </ul>
    <a class="cta" href="${training}">Go to awareness training</a>
  </main>`;
  return page({ title: 'Phishing simulation — disclosure', body });
}

module.exports = { renderLandingPage, renderDisclosurePage, escapeHtml };
