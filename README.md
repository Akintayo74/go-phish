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
docs/        Design notes and phase records
IMPLEMENTATION_PLAN.md   The 12-phase build plan (start here)
```

This is an npm workspaces monorepo.

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

## Build status

Phases 0–8 complete (scaffolding; data model & schema; consent & participant
management; admin auth + campaign CRUD skeleton; simulated landing page + dummy
form + disclosure; interaction tracking + campaign delivery; CAT platform —
lesson modules + resource library; CAT platform — quiz engine + knowledge
checks; automatic enrollment loop). Next: **Phase 9 — analytics dashboard**. See
[`IMPLEMENTATION_PLAN.md`](./IMPLEMENTATION_PLAN.md) and
[`docs/PHASE_LOG.md`](./docs/PHASE_LOG.md).

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
