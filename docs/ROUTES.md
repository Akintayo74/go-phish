# Routes, and how a human reaches them

Every other document here describes routes one feature at a time. This one
answers the question a new maintainer asks first: **what can you actually click
to, and what can you only reach by typing a URL?**

It exists because the answer is not uniform, and the non-uniformity is
deliberate. Three of this system's surfaces have no link pointing at them from
anywhere, and that is a guardrail rather than an omission — §2 gives the
reasoning. §3 is how you demo those surfaces anyway.

Legend: 🖱️ reachable by clicking · ⌨️ URL only.

---

## 1. The map

### Client routes (hash-based, served by the React SPA)

| Route | Renders | Reached by |
|---|---|---|
| 🖱️ `#/` | Public landing | Default — `App.jsx` falls through to it for **any** unrecognised hash |
| 🖱️ `#/learn` | Resource library | "Start the lessons" and the footer button on the landing; the wordmark on any lesson page |
| 🖱️ `#/learn/<slug>` | One lesson + its knowledge check | Lesson rows in the library; the sticky lesson rail (desktop) |
| 🖱️ `#/admin` | Admin console (login, then the console) | "Administrator sign-in", top right of the landing |
| ⌨️ `#/enroll/<token>` | The participant's assigned training | The enrollment email only — see §2 |

The wordmark on `#/learn`, `#/learn/<slug>` and inside the console links back to
`#/`. Nothing else navigates between top-level surfaces.

### Server routes (served by Express, outside the SPA)

| Route | Renders | Reached by |
|---|---|---|
| ⌨️ `/t/<token>` | Nothing — records the click, redirects to the decoy | The lure email only |
| ⌨️ `/t/<token>/pixel.gif` | 1×1 GIF — records the open | The lure email only |
| ⌨️ `/sim/<token>` | The decoy sign-in page | Redirect from `/t/<token>` |
| ⌨️ `/sim/<token>/disclosure` | The disclosure page | Redirect from submitting the decoy form |
| `/health` | Liveness + DB check | The deploy platform (`render.yaml` `healthCheckPath`) |
| `/api/health` | The same contract | The landing page's "Service status" line |

`/health` and `/api/health` are the same router mounted twice, on purpose — the
platform needs the bare path, the browser can only reach `/api`. See the mount
comment in `backend/src/app.js`.

### Inside the admin console

The console is one hash route; everything within it is state, not routing. No
sub-route is hidden behind a URL.

- Sidebar: **Campaigns** ↔ **Cohorts & consent**, sign out, wordmark → `#/`
- Campaigns: create, lifecycle transitions (mirroring the backend state machine),
  **Analytics** (with **Export CSV**), **Compare phases**, **Clone as new phase**,
  **Send** — the last three Program Admin only
- Cohorts: create/edit/delete a cohort, grant/withdraw consent, and the
  participant roster (add, edit, delete, opt in/out, look up by address)

Write controls are hidden from Researchers. That hiding is presentation only —
the authorization lives on the routes (`consent.authz.guardrail`).

---

## 2. Why three surfaces have no link pointing at them

`/t/<token>`, `/sim/<token>` and `#/enroll/<token>` are unreachable by clicking
from anywhere in this product. Do not "fix" that. Three separate reasons, and
each survives on its own:

**The measurement depends on an unprompted arrival.** A participant is supposed
to meet the decoy because they followed a lure they believed, not because they
found it on the training site. A link from the public pages would put visitors
who came to look into the same click data as people who were actually deceived,
and there is no field that distinguishes them afterwards.

**A per-participant token is not a thing a page can link to.** These routes are
keyed by an opaque token minted per participant per send. There is no static URL
to put in an anchor. An entry point would therefore have to be a "paste your
token" box — which is a guessing oracle against another person's decoy or
training record.

**Linking them from the console would break guardrail #5.** A console screen
that hands an operator a participant's tracked link is, by construction, a
person→behaviour map. That is precisely what the aggregate-only design exists to
prevent. The evidence that this is held to: `e2e/README.md` documents that the
Playwright harness reads tokens straight out of the database, because **no API
returns one** — and it justifies that as a test-oracle exception rather than
adding an endpoint.

A fourth, softer reason applies to the decoy specifically: it is phishing-shaped
content on a public host. It sends `noindex, nofollow` and carries a fictional
brand for exactly that reason (`README.md`, "Before pointing it at anyone").
Inbound links work against keeping it un-indexed.

---

## 3. How to demo the participant journey

### The real walkthrough — Mailpit

This is the demo to give. It walks the genuine loop with no URL typing at all,
because the participant's links arrive the way they arrive in production.

Set `MAIL_PROVIDER=smtp` against a local catcher (`README.md`, "Seeing real email
locally"), send the campaign to your own address from the console, then open the
caught message at `localhost:8025` and click the link in it:

```
send (console) → click the mail → decoy → submit → disclosure
              → auto-enrol → enrollment mail → training → pass the quiz → completed
```

`MAIL_PROVIDER=console` (the CI default) **cannot** be demoed this way. It sends
nothing, so the token exists only in the database and has to be read out by hand.

### The no-setup shortcut — a tokenless decoy

`GET /sim/:token` never looks the token up. It is a pure stateless render
(`backend/src/routes/sim.js`), so **any** string works and nothing is recorded:

```
/sim/demo               → the decoy sign-in page
/sim/demo/disclosure    → the disclosure page
```

That is the whole Phase 4 surface with no email, no database row, and no
interaction flagged. It is the right way to show the decoy in a presentation, or
to review its copy, when standing up a mail catcher is not worth it.

What this shortcut cannot show: `#/enroll/<token>` needs a real assignment
(the token is looked up), and `/t/<token>` will redirect with a bogus token but
records nothing, so the tracking half of the loop needs Mailpit.

---

## 4. API endpoints with no UI

These work and are documented, but no screen calls them. That is fine as long as
it is known — it is listed here so nobody assumes a button exists.

| Endpoint | Why it has no UI |
|---|---|
| `GET/POST /api/admin/users` | Admin accounts come from `seeds/02_admin_users.js` or `scripts/bootstrap.js`. Creating an operator is a deployment act, not a routine one. Adding an operator to a running instance currently needs a direct API call. |
| `PATCH /api/campaigns/:id` | No edit form. A campaign's name or phase label cannot be corrected from the console. |
| `DELETE /api/campaigns/:id` | No delete control. Archive is the lifecycle-correct way to retire a campaign, and it is in the UI. |
| `GET /api/learn/modules` | The library view uses `/api/learn/library` (grouped) instead. `learnApi.modules()` exists unused. |

`GET /api/analytics/campaigns/:id/export` **used to be on this list** — the
endpoint shipped in Phase 9 with no control anywhere, so the one artefact a
Researcher needs was reachable only by hand-crafting an authenticated request.
It is now the **Export CSV** button in the analytics panel.

---

## 5. Known gaps, left open deliberately

- **The landing's footer button is mislabelled.** "Participation notice" links to
  `#/learn`, the lesson library. No participation-notice or data-handling module
  exists — the six published modules are all phishing content. Either write that
  module or retarget the link; do not leave a promise about data handling
  pointing at something else.
- **The console is descoped below 920px** by the handoff. The shell degrades
  (the sidebar wraps above the content) rather than inventing a layout the design
  never specified.
- **No console preview of the decoy.** §3's `/sim/demo` covers this. A tokenless
  "Preview decoy — records nothing" link in the console would not violate the §2
  reasoning (no token, no interaction row, and the page is already publicly
  renderable at any string), but it has not been added.
