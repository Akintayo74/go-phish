# CAT-Sim

Consent-based **phishing simulation** + web-based **Cybersecurity Awareness
Training (CAT)** platform. Built to measure susceptibility to social
engineering in the Nigerian financial sector and to route anyone who falls for
a simulation into targeted training.

> **Read the guardrails first.** This system simulates a real attack technique.
> It must only ever run against an organization's own consented staff, must
> never capture or store real credentials, and every simulated interaction
> must end in disclosure. See [`IMPLEMENTATION_PLAN.md`](./IMPLEMENTATION_PLAN.md)
> §1 before writing any code.

## Repository layout

```
backend/     Express + PostgreSQL API (Knex migrations, Jest/Supertest tests)
frontend/    React (Vite) — admin console + public CAT learning site
docs/        Design notes, phase records, and the route map
IMPLEMENTATION_PLAN.md   The 12-phase build plan (start here)
```

This is an npm workspaces monorepo.

**New to the codebase?** [`docs/ROUTES.md`](./docs/ROUTES.md) maps every route to
how a human reaches it — including the three participant-facing surfaces that are
deliberately unreachable by clicking, why they are, and how to demo them anyway.

## Prerequisites

- Node.js >= 20
- PostgreSQL (local or containerized) for running the backend against a DB

## Getting started

```bash
npm install              # installs backend + frontend workspaces

# Backend
cp backend/.env.example backend/.env    # then edit DATABASE_URL
npm run dev:backend                      # http://localhost:4000/health

# Frontend
npm run dev:frontend                     # http://localhost:5173
```

## Sending from the admin console

Each campaign row in `#/admin` carries a **Send** control (Program Admin only —
a Researcher never sees it, mirroring the backend role gate). It takes a roster
of raw recipient addresses, one per line or comma-separated, and drives both
sends: **Send simulation** (the lure) and **Notify enrolled** (the training
email for participants the enrollment loop has already assigned).

Two properties the panel deliberately holds to, matching the backend:

- **The roster is transient.** It lives in component state only — never
  `localStorage`, never a query string — and is dropped as soon as the send
  returns. The backend stores only a keyed hash to match each address against a
  consented participant (guardrail #6) and never persists the address itself.
- **The receipt is aggregate-only.** It renders counts and withholding reasons
  ("3 withheld by the consent gate"), never a per-recipient outcome. *Which* of
  your staff clicked is precisely what this system is built not to answer
  (guardrail #5), and that must not be softened here for convenience.

`Send simulation` is disabled unless the campaign is `active`, mirroring the
backend's lifecycle refusal. `SendPanel.test.jsx` pins all of the above.

## Seeing real email locally (Mailpit)

`MAIL_PROVIDER=console` is hermetic — it sends nothing, so the per-participant
tracking token exists only in the database and has to be read out by hand. That
is fine for CI, but it makes the loop unwalkable as a human.

Set `MAIL_PROVIDER=smtp` and point it at a local mail catcher instead. Simulated
mail then becomes *real* mail that still cannot reach a real person:

```bash
docker run -d --name catsim-mailpit -p 1025:1025 -p 8025:8025 axllent/mailpit
```

```bash
# backend/.env
MAIL_PROVIDER=smtp
SMTP_HOST=localhost
SMTP_PORT=1025
APP_BASE_URL=http://localhost:5173   # see "Two origins" below
```

Read the inbox at <http://localhost:8025>. Send a campaign, open the lure email,
and click its link — no `psql`, no token copying. The enrollment notification
arrives the same way with the training link.

For a real deployment, set `SMTP_HOST`/`SMTP_USER`/`SMTP_PASS` to a transactional
relay. `SMTP_PASS` is never logged, and an SMTP error is re-thrown with its error
*code* only — provider messages routinely echo the recipient address back, and
that address must not reach a log or a stack trace (guardrail #6).

### Two origins: `PUBLIC_BASE_URL` vs `APP_BASE_URL`

Participant links are served from two different places, and using the wrong one
produces a link that silently resolves to a JSON `404` — nothing throws, and the
send still reports success:

| Link | Served by | Built from |
|---|---|---|
| `/t/<token>`, `/sim/<token>` | this API | `PUBLIC_BASE_URL` |
| `#/enroll/<token>`, `#/learn` | the React app | `APP_BASE_URL` |

`APP_BASE_URL` defaults to `PUBLIC_BASE_URL`, so a single-origin deployment (the
frontend served by Express) needs no extra config. Set it whenever the frontend
is served separately — the Vite dev server, or a static host in production.
`tests/link.origins.test.js` pins the distinction.

> Note `SIM_TRAINING_URL` must be **quoted** in a `.env` file. An unquoted `#`
> opens an inline comment, so `SIM_TRAINING_URL=/#/learn` parses as `"/"`.

## Tests

```bash
npm test                 # runs all workspace test suites
npm test --workspace backend
npm test --workspace frontend
```

The backend suite includes a **named guardrail test**
(`backend/tests/logging.test.js`) asserting that request bodies and query
strings — where a simulated credential would appear — never reach any log
sink. Do not weaken or remove it.

## Deployment

CAT-Sim deploys as a **single origin**: one Node process serves the API *and*
the built React app. This is not a packaging preference — the client calls the
API with relative paths (`fetch('/api/...')`) and `backend/src/app.js` registers
no CORS middleware, so a split frontend/backend deployment fails in the browser
on every request.

Single origin also collapses the two participant-facing base URLs into one.
Tracked links (`/t`, `/sim`) and training links (`#/learn`, `#/enroll`) share a
host, so `APP_BASE_URL` and `SIM_TRAINING_URL` need no override.

```bash
npm ci --include=dev && npm run build   # builds frontend/dist
npm run bootstrap                       # migrate; seed only a fresh database
npm start                               # serves API + SPA on $PORT
```

`--include=dev` is required, not defensive: `NODE_ENV=production` makes npm omit
devDependencies, and `vite` is one, so a plain `npm ci` builds nothing and the
deploy dies on `vite: not found`.

`backend/src/app.js` mounts `frontend/dist` when it exists and falls back to
`index.html` for app routes, while leaving `/api`, `/t`, `/sim` and `/health` to
their real handlers — including their 404s, so an unknown API path still answers
as JSON rather than as the SPA document. Pinned by
`backend/tests/static.spa.test.js`. In development the directory is absent, Vite
serves the app on :5173 and proxies `/api` back, and none of this mounts.

### Render

[`render.yaml`](./render.yaml) is a Blueprint for one web service + one
Postgres. Dashboard → New → Blueprint → point at this repo. There is no second
step: the free tier offers neither a pre-deploy command nor shell access, so
[`backend/scripts/bootstrap.js`](./backend/scripts/bootstrap.js) runs from the
start command instead — migrating every boot and seeding only a database that
has never been seeded.

That guard is load-bearing. The seeds are **destructive** (`01_demo_data.js`
clears cohorts, participants and interactions before inserting) and a free
instance restarts every time it wakes from idle, so an unguarded seed would
erase collected behavioural data on every cold start. `SEED_ON_BOOT` controls
it: `auto` (default) seeds only an unseeded database, `never` skips seeding,
`force` reseeds and **discards collected data**.

Log in the first time with `admin@example.test` and the generated
`SEED_ADMIN_PASSWORD`, readable in the Render dashboard's Environment tab. Then
create your own operator and remove the demo accounts.

It leaves `PUBLIC_BASE_URL` unset on purpose: config falls back to Render's own
`RENDER_EXTERNAL_URL`, so tracked links resolve to the real host without a
manual step. Getting that value wrong is the most damaging misconfiguration
available here — it is the origin a participant's mail client resolves, so a
deployment that forgets it mails out links pointing at `localhost`.

Two free-tier caveats: a free web service spins down after ~15 minutes idle (the
first tracked-link click after a quiet spell waits out a cold start), and a free
Postgres instance is **deleted 30 days after creation**.

### Before pointing it at anyone

Walk [`docs/PRE_LAUNCH_CHECKLIST.md`](./docs/PRE_LAUNCH_CHECKLIST.md) — it is a
launch gate, not a description of aspirations. Two deployment-specific notes:

- **Secrets.** `IDENTITY_HASH_SECRET` and `JWT_SECRET` default to published dev
  placeholders. `render.yaml` generates both. Bootstrap refuses to seed under
  `NODE_ENV=production` without `SEED_ADMIN_PASSWORD` rather than installing the
  dev password that is committed to this repository — and it checks that
  *before* touching the database, so a missing value cannot leave a half-seeded
  deployment with content but no operator to log in as.
- **A public decoy page attracts scanners.** Every host's acceptable-use policy
  prohibits phishing content, and automated reputation services do not read the
  guardrails before flagging a URL. What keeps this legitimate is already in
  place — `SIM_BRAND_NAME` is a fictional placeholder, the decoy sends
  `noindex, nofollow`, the form handler discards `req.body`, and disclosure is
  immediate. Never set `SIM_BRAND_NAME` or `MAIL_FROM` to a real organization,
  not even for a demo.

## Build status

**Phases 0–11 complete** — the full MVP (scaffolding; data model & schema;
consent & participant management; admin auth + campaign CRUD skeleton; simulated
landing page + dummy form + disclosure; interaction tracking + campaign delivery;
CAT platform — lesson modules + resource library; CAT platform — quiz engine +
knowledge checks; automatic enrollment loop; analytics dashboard; Phase II /
re-test support; **E2E testing, security & log audit, pre-launch hardening**). See
[`IMPLEMENTATION_PLAN.md`](./IMPLEMENTATION_PLAN.md),
[`docs/PHASE_LOG.md`](./docs/PHASE_LOG.md), and the launch gate
[`docs/PRE_LAUNCH_CHECKLIST.md`](./docs/PRE_LAUNCH_CHECKLIST.md).

Admin console auth is JWT-based (Phase 3). Operators have one of two roles —
`program_admin` (manages campaigns, cohorts, participants, operators) and
`researcher` (read/evaluate only). Log in at `POST /api/auth/login`; the token
is a `Bearer` credential for the `/api/*` routes. Campaigns live under
`/api/campaigns` as a **CRUD skeleton only — no email is sent** (delivery is
Phase 5); a campaign's `status` moves solely through the lifecycle transition
endpoints (`/activate`, `/pause`, `/complete`, `/archive`). Admin passwords are
stored as salted scrypt verifiers and are **never** returned in a response — the
named test `backend/tests/admin.credentials.guardrail.test.js` pins this; do not
weaken it. The admin UI shell lives at the frontend `#/admin` route.

Consent is the load-bearing delivery gate (guardrail #3): the cohort/participant
APIs live under `/api/cohorts` and `/api/participants`, and **all** future
targeting must go through `backend/src/services/consent.js` — a participant is
deliverable only when their cohort's consent is `granted` and they have not
opted out. The named test `backend/tests/consent.guardrail.test.js` pins this
rule; do not weaken it.

The schema enforces the credential-safety invariant: the `interactions` table
has **no column** able to hold a submitted credential, checked by the named
tests `backend/tests/schema.interactions.guardrail.test.js` (DB-free) and
`backend/tests/schema.db.test.js` (against Postgres). Do not weaken them.

The simulated landing page (Phase 4) is participant-facing and **unauthenticated**
under `/sim` — reached via a tracked link, not the admin console. `GET /sim/:token`
renders a **generic, fictional** login page (it must never impersonate a real
brand; the placeholder is `SIM_BRAND_NAME`), `POST /sim/:token` **discards every
posted value** and records only `submitted = true` before redirecting to
`GET /sim/:token/disclosure`, which reveals the simulation (guardrail #4). The
pages are server-rendered with **no client JavaScript**. The named test
`backend/tests/sim.form.guardrail.test.js` pins that submitted field values are
never persisted, logged, or echoed — do not weaken it.

Interaction tracking + delivery (Phase 5) mint one opaque token per
(campaign, participant) and email it as a tracked link. The public, unauthenticated
tracking routes live under `/t`: `GET /t/:token` flips `clicked` (which implies
`opened`) and redirects to the Phase 4 decoy page, and `GET /t/:token/pixel.gif`
is an optional open-tracking pixel — both record behavioral flags only and leak
nothing about whether a token is valid. A Program Admin triggers a manual send
with `POST /api/campaigns/:id/send` (the campaign must be `active`); because the
system stores only a keyed **hash** of each address (guardrail #6), the admin
supplies the raw recipient roster **transiently in the request body** — it is
hashed to match stored participants, gated through `services/consent.js`
(guardrail #3), used only as the mail `to`, and **never persisted**. Sending uses
a pluggable mailer (`MAIL_PROVIDER`, default hermetic `console`) and the response
is an **aggregate summary only** (guardrail #5). The named test
`backend/tests/delivery.guardrail.test.js` pins that non-consented/opted-out
targets are never emailed and that no raw address reaches any table — do not
weaken it.

The CAT learning site (Phase 6) is the public, **unauthenticated** awareness-
training platform — a resource anyone may read, explicitly **not** gated behind
failing a simulation. Its read-only content API lives under `/api/learn`:
`GET /api/learn/library` (published modules grouped by category for the resource
library), `GET /api/learn/modules` (published index, metadata only, optional
`?category=`), and `GET /api/learn/modules/:slug` (one published module with its
markdown body). Only `published = true` modules are ever exposed — a draft is an
indistinguishable 404 — and the API records nothing about who reads what
(guardrail #6). The named test `backend/tests/learn.published.guardrail.test.js`
pins that every public read path filters on `published = true`; do not weaken it.
The site is served by the frontend `#/learn` route, which renders modules from a
small dependency-free, script-safe Markdown renderer, and the Phase 4 disclosure
page's training link now points here (`SIM_TRAINING_URL`, default `/#/learn`).

The knowledge-check quiz engine (Phase 7) extends the public `/api/learn` API
with a per-module quiz: `GET /api/learn/modules/:slug/quiz` returns the quiz
**without the answer key** (each question's correct choice is stripped
server-side), and `POST /api/learn/modules/:slug/quiz/attempt` scores a submitted
attempt against the private key, returning an **aggregate-only** result (score +
pass/fail against `pass_threshold`). Scoring happens on the server so the answer
key never reaches the browser; the attempt endpoint is **stateless** — no
participant answers are stored (Phase 8 wires completion tracking off the
result). Only quizzes on `published = true` modules are exposed. The named test
`backend/tests/quiz.answerkey.guardrail.test.js` pins that the answer key never
leaves the server; do not weaken it. The quiz renders beneath each lesson on the
frontend `#/learn/<slug>` route.

The automatic enrollment loop (Phase 8) closes the loop from measured
vulnerability to targeted education. When a participant meets a campaign's
`enrollment_trigger` — a click (`GET /t/:token`) or, stricter, a simulated-form
submit (`POST /sim/:token`) — `backend/src/services/enrollment.js` auto-creates a
`training_assignment` (recording `assigned_reason`, idempotent per
`(participant, module, campaign)`) linking them to the configured **published**
module (`ENROLLMENT_MODULE_SLUG`, default `recognizing-phishing`). Enrollment is a
**best-effort side effect** — it never interrupts the participant's redirect or
the guaranteed disclosure (guardrail #4). Each assignment mints an opaque
`completion_token`; the participant-facing, unauthenticated routes under
`/api/enroll` use it so an enrolled participant can complete **their** assignment
without a login (the CAT site is otherwise anonymous): `GET /api/enroll/:token`
returns the assignment + assigned module (advancing `assigned → in_progress`),
and `POST /api/enroll/:token/quiz/attempt` scores the knowledge check
**server-side** (the answer key never leaves the server) and marks the assignment
`completed` on a pass. A Program Admin sends the "you've been enrolled" email with
`POST /api/campaigns/:id/notify-enrollments`; like delivery, the raw roster is
supplied **transiently** and gated through `services/consent.js`, used only as the
mail `to`, and **never persisted** (only `notified_at` is stamped) — the response
is an aggregate summary only. The named test
`backend/tests/enrollment.guardrail.test.js` pins that the notification never
persists a raw address, that the summary is aggregate-only, and that an
assignment holds no credential-shaped field; do not weaken it. The training
landing renders on the frontend `#/enroll/<token>` route.

The analytics dashboard (Phase 9) is the aggregate-only reporting surface
(guardrail #5). Its read-only API lives under `/api/analytics` and is open to
**any** authenticated operator (researchers included — analysis is their job),
not just Program Admins: `GET /api/analytics/campaigns/:id` returns the
susceptibility report — overall open/click/submission rates plus the
**four-tier breakdown** (no action / opened only / clicked only /
clicked+submitted) and training-completion rollup — **grouped by cohort or
department** (`?group_by=cohort|department`); `GET /api/analytics/compare?campaign_ids=a,b`
is the **phase-over-phase** side-by-side (per-campaign rates + deltas against the
baseline); and `GET /api/analytics/campaigns/:id/export` streams an **anonymized**
CSV (or `?format=json`) of the per-group breakdown — the **Export CSV** control
in the analytics panel. That control fetches with the bearer token and saves the
blob rather than being a plain `<a href download>`, because a link carries no
headers and the download would arrive as a 401. Every number is an aggregate:
`backend/src/services/analytics.js` fetches only the group dimension + behavioral
flags (never a participant id/hash — see `backend/src/repositories/analytics.js`)
and applies **small-group suppression** (k-anonymity, `ANALYTICS_MIN_GROUP_SIZE`,
default 5) so a cohort/department smaller than the threshold is never reported
with its own counts — it collapses into an outcome-free "N groups / N
participants hidden" summary, and a whole campaign below the threshold has its
totals suppressed too. The named test
`backend/tests/analytics.guardrail.test.js` pins that no identifier reaches the
output and that small groups are suppressed; do not weaken it. The dashboard
renders per campaign in the admin console (`#/admin`), and the export carries no
more than the panel above it.

Phase II / re-test support (Phase 10) closes the research loop. A Program Admin
can **clone** a campaign as a new phase (`POST /api/campaigns/:id/clone`): the
clone is born `draft`, links back to its source via `cloned_from_campaign_id`,
and copies only the campaign **definition** — never the source's status,
schedule, or behavioral data — so a re-test starts clean against the same or an
updated cohort. `GET /api/campaigns/:id/phases` returns a campaign's whole
re-test family (original + all clones, oldest-first). The admin console adds a
"Clone as new phase" control and a **"Compare phases"** panel that lays the phases
side by side with the percentage-point change in click/submission rate against
the baseline phase (a falling submission rate is the training loop working). The
comparison reuses the aggregate-only analytics compare endpoint, so it inherits
the same k-anonymity suppression — a phase with too few targets contributes no
per-individual data.

E2E testing, security audit & pre-launch hardening (Phase 11) is the final phase.
It adds a **campaign pause/rollback** mechanism: while a campaign is not `active`,
its tracked links record **no new behavioral flags** and trigger **no new
enrollment** — but the participant still reaches the decoy (token validity never
leaks) and the disclosure page still renders (guardrail #4). The gate lives in
`backend/src/services/campaignState.js` (fail-open, since it governs behavioral
flags — not a legal-safety guardrail — so a transient lookup never drops a live
campaign's data) and is enforced again, defense-in-depth, in the enrollment
service; the named test `backend/tests/pause.rollback.guardrail.test.js` pins it.
The phase re-verifies the whole system: `backend/tests/system.credential.audit.test.js`
drives the integrated loop and proves no submitted value or raw address escapes
through logs, console/traces, response bodies + headers, or the persisted store;
`backend/tests/system.loop.integration.test.js` runs the full send → click →
submit → disclosure → auto-enroll → training-completion loop over HTTP (DB-free,
via an in-memory repository layer); and `backend/tests/delivery.loadtest.test.js`
load-tests email sending over a 1,000-recipient roster with the provider throttle
honored. A Playwright browser E2E of the same loop (plus a pause/rollback check)
lives under [`e2e/`](./e2e) — it runs against a live stack (`npm run test:e2e`) and
is intentionally outside the root workspaces so `npm test` stays DB/browser-free.
The Dev Guide's pre-launch checklist is walked in
[`docs/PRE_LAUNCH_CHECKLIST.md`](./docs/PRE_LAUNCH_CHECKLIST.md), mapping every
guardrail to where it is enforced and the named test that pins it.
