# CAT-Sim — Comprehensive Project Overview

*A single-document tour of what this project is, what the development spec
required, what has been built, how it works, and how to run and test the whole
system end to end.*

> Repository: `akintayo74/go-phish` · Project name: **CAT-Sim** · Status:
> **Phases 0–11 complete (full MVP)**

---

## 1. What this project is

**CAT-Sim** is a two-part, consent-based security platform aimed at the
Nigerian financial sector:

1. **A consent-based phishing simulation.** An organization runs a controlled,
   fake phishing campaign against *its own consented staff* to measure how
   susceptible they are to social engineering — who opens a lure email, who
   clicks the link, who submits credentials on a fake login page.

2. **A public Cybersecurity Awareness Training (CAT) platform.** A free,
   public learning site (lessons + knowledge-check quizzes) that anyone can
   read. It is *not* gated behind failing a simulation.

The two halves are joined by an **automatic enrollment loop**: any staff member
who falls for the simulation (clicks or submits) is automatically enrolled into
targeted training. This closes the loop from **measured vulnerability →
targeted education**, and a later "Phase II" re-test measures whether the
training worked (a falling submission rate is the loop succeeding).

Because the system deliberately simulates a real attack technique, it is built
around a set of **non-negotiable ethical and legal guardrails** (see §3). It
must only ever run against an organization's own consented staff, it must
**never** capture or store a real credential, and every simulated interaction
must end in a disclosure page.

### Where it targets

The training content is tailored to **Nigerian-context tactics** (SIM swap,
smishing, vishing, impersonation) and the data-handling design is **NDPC-aligned**
(Nigeria Data Protection Commission) — data minimization is a first-class
requirement, not an afterthought.

---

## 2. The development spec it was built from

The build was driven by two source documents, distilled into
[`IMPLEMENTATION_PLAN.md`](../IMPLEMENTATION_PLAN.md):

- **CAT_Sim_PRD_1** — the product requirements document (features + the
  ethical/legal section that became the guardrails).
- **CAT_Sim_MVP_Dev_Guide** — the developer build guide (tech stack, schema,
  build order, pre-launch checklist).

The implementation plan reorganized these into **12 self-contained phases
(Phase 0 – Phase 11)**, each scoped to a single focused work session. Phases
carrying subtle correctness/ethics invariants (schema safety, the sensitive
dummy form, aggregate-only analytics, the final security audit) were assigned
the stronger model; well-specified CRUD/UI/integration work used the faster
model.

### 2.1 Required tech stack (from the Dev Guide)

| Layer | Choice as specified | As built |
|---|---|---|
| Backend | Node.js + Express (REST) | Express app, `backend/` |
| Database | PostgreSQL | Postgres + Knex migrations |
| Frontend | React (admin console + public CAT site) | React + Vite, `frontend/` |
| Email | Transactional API (SendGrid / Mailgun / SES) | Pluggable mailer (`console`, `smtp`; provider seam ready) |
| Auth | JWT (admin/researcher only; CAT site public) | JWT bearer sessions, two roles |
| Hosting | Single small cloud instance (Render/Heroku-class) | Single-origin Node process; `render.yaml` Blueprint |
| Tests | Jest + Supertest (backend); Vitest + Testing Library (frontend); Playwright (E2E) | All three, plus named guardrail tests |

**Repo shape:** an npm-workspaces monorepo — `backend/`, `frontend/`, `docs/`,
plus a deliberately-separate `e2e/` (kept out of the root workspaces so
`npm test` stays DB/browser-free).

### 2.2 Explicitly deferred past the MVP

The plan explicitly parks these out of scope: SMS/smishing *delivery*, a
browser extension, org-wide scale, a CMS for authoring content, and in-app
perception surveys.

---

## 3. The non-negotiable guardrails

These come straight from the PRD's ethical/legal section. They apply to every
phase, and each has an **explicit, named automated test** that pins it — the
tests are marked "do not weaken." This is the spine of the whole project.

| # | Guardrail | What it means | Enforced in | Pinned by (named test) |
|---|---|---|---|---|
| 1 | **No real credentials, ever** | The `interactions` table has **no column** able to hold a submitted username/password. The dummy form handler discards posted values and keeps only `submitted = true`. Enforced at the *schema* level so a future dev can't accidentally add credential capture. | `migrations/…create_interactions.js`, `routes/sim.js`, `repositories/interactions.js` | `schema.interactions.guardrail`, `schema.db`, `sim.form.guardrail`, `system.credential.audit` |
| 2 | **POST bodies excluded from logs** | No credential-shaped data in access logs, error traces, query strings, or headers — globally, defensively. | `middleware/requestLogger.js` | `logging`, `system.credential.audit` |
| 3 | **Consent-gated delivery** | No campaign can send to a participant unless their cohort's consent is `granted` **and** they have not opted out. All targeting routes through a single `isDeliverable` predicate; fail-closed. | `services/consent.js`, `services/delivery.js`, `services/enrollment.js` | `consent.guardrail`, `delivery.guardrail`, `enrollment.guardrail`, `consent.authz.guardrail` |
| 4 | **Transparency / disclosure** | Every simulated interaction ends at a disclosure page telling the participant it was a simulation — shown even for an unknown token and even when the campaign is paused. | `routes/sim.js`, `views/simPages.js` | `sim.routes`, `sim.form.guardrail`, `pause.rollback.guardrail` |
| 5 | **Aggregate-only reporting** | Management/researcher views group by cohort/department and **never** expose a per-individual result. Small-group k-anonymity suppression. Send/notify receipts are counts only. Per-person lookups exist only as backend logic for the enrollment loop. | `services/analytics.js`, `repositories/analytics.js`, `services/delivery.js`, `services/enrollment.js`, `frontend ParticipantRoster` | `analytics.guardrail`, `delivery.guardrail`, `enrollment.guardrail`, `system.loop.integration` |
| 6 | **Data minimization (NDPC-aligned)** | Store only role/department/cohort + click/submit/timestamp flags. Only a keyed **hash** of a contact is stored; raw addresses are supplied transiently and never persisted. No punitive framing; sandboxed infra. | `lib/hash.js`, `repositories/participants.js`, `services/delivery.js`, `services/enrollment.js` | `delivery.guardrail`, `enrollment.guardrail`, `system.credential.audit` |

---

## 4. What is done — the 12 phases

All phases **0 through 11 are complete**; the full MVP is built and tested.

| # | Phase | Status | What it delivered |
|---|---|:--:|---|
| 0 | Scaffolding & foundations | ✅ | Monorepo, Express skeleton + `/health`, Postgres + Knex, central config, `.env.example`, **global request logger that excludes POST bodies** (guardrail #2), test harness wired. |
| 1 | Data model & schema | ✅ | Migrations for `cohorts`, `campaigns`, `participants`, `interactions`, `learning_modules`, `quizzes`, `training_assignments`. **Schema-level credential-safety invariant** on `interactions`. Hashed participant contact. Repository/query layer + seed data. |
| 2 | Consent & participant management | ✅ | Cohort + participant CRUD; cohort-level consent status + individual opt-out; the single `isDeliverable` consent gate that all delivery must route through. |
| 3 | Admin auth + campaign CRUD skeleton | ✅ | JWT login; two roles (`program_admin`, `researcher`); campaign CRUD + lifecycle transition endpoints (`/activate`, `/pause`, `/complete`, `/archive`) — **no email sent yet**; admin scrypt password verifiers never returned in a response; admin UI shell. |
| 4 | Simulated landing page + dummy form + disclosure | ✅ | `GET /sim/:token` renders a **generic, fictional** login page (no real-brand impersonation); `POST /sim/:token` **discards every posted value**, records `submitted = true`, redirects to `GET /sim/:token/disclosure`. **No client JavaScript** — one auditable server-rendered file. |
| 5 | Interaction tracking + campaign delivery | ✅ | One opaque token per (campaign, participant); `GET /t/:token` flips `clicked`→`opened` and redirects to the decoy; `/t/:token/pixel.gif` open pixel; `POST /api/campaigns/:id/send` (Program Admin, campaign must be `active`) hashes a **transient** roster, gates through consent, mails a tracked link, returns an **aggregate summary only**. Pluggable mailer + rate throttle. |
| 6 | CAT platform — lessons + resource library | ✅ | Public, unauthenticated learning site; `/api/learn` read-only content API; only `published = true` modules exposed (a draft is an indistinguishable 404); reads record nothing about who reads what. Dependency-free, script-safe Markdown renderer on `#/learn`. |
| 7 | CAT platform — quiz engine | ✅ | Per-module knowledge checks; `GET .../quiz` returns the quiz **without the answer key**; `POST .../quiz/attempt` scores **server-side**, returns aggregate score + pass/fail vs `pass_threshold`; stateless (stores no answers). Answer key never leaves the server. |
| 8 | Automatic enrollment loop | ✅ | On the campaign's `enrollment_trigger` (click, or stricter submit), auto-creates an idempotent `training_assignment` linking the participant to the configured published module. Best-effort side effect (never interrupts disclosure). Tokened `/api/enroll` routes let an enrolled participant complete training without a login; `POST /api/campaigns/:id/notify-enrollments` mails the "you've been enrolled" email (transient roster, consent-gated, aggregate receipt). |
| 9 | Analytics dashboard | ✅ | Aggregate-only `/api/analytics` (open to researchers too): susceptibility report with the **four-tier breakdown** (no action / opened only / clicked only / clicked+submitted) grouped by cohort or department, phase-over-phase compare, anonymized CSV/JSON export. **k-anonymity small-group suppression** (`ANALYTICS_MIN_GROUP_SIZE`, default 5). Never fetches a participant id/hash. |
| 10 | Phase II / re-test support | ✅ | `POST /api/campaigns/:id/clone` copies only the campaign **definition** (never status/schedule/behavioral data), is born `draft`, links back via `cloned_from_campaign_id`; `GET /api/campaigns/:id/phases` returns the whole re-test family; "Compare phases" panel shows the percentage-point change against the baseline phase. |
| 11 | E2E, security & log audit, pre-launch hardening | ✅ | Campaign **pause/rollback** (paused → no new flags, no new enrollment, but decoy + disclosure still render); whole-system credential-leak audit (`system.credential.audit`); DB-free full-loop integration test (`system.loop.integration`); 1,000-recipient email **load test**; Playwright browser E2E under `e2e/`; the walked **pre-launch checklist**. |

Full narrative history is in [`docs/PHASE_LOG.md`](./PHASE_LOG.md); the launch
gate is [`docs/PRE_LAUNCH_CHECKLIST.md`](./PRE_LAUNCH_CHECKLIST.md).

---

## 5. How it functions

### 5.1 Architecture at a glance

```
                         ┌──────────────────────────────────────────┐
   Participant's mailbox │  Lure email  →  /t/<token>  (tracking)    │
   (real email, tracked) │  Enrollment email → #/enroll/<token>      │
                         └──────────────────────────────────────────┘
                                        │ click
                                        ▼
   ┌────────────────────────── Express (single origin) ─────────────────────────┐
   │  /health        liveness + DB check                                          │
   │  /t/<token>     record click → redirect to decoy   (public, tokened)         │
   │  /sim/<token>   decoy sign-in → POST discards → /disclosure  (public)        │
   │  /api/auth      JWT login                                                     │
   │  /api/cohorts   consent unit + transitions        (Program Admin writes)     │
   │  /api/participants  roster + opt-out              (Program Admin writes)     │
   │  /api/campaigns CRUD + lifecycle + send + notify + clone + phases            │
   │  /api/learn     public lessons + quiz (no answer key to client)              │
   │  /api/enroll/<token>  tokened, login-free training completion                │
   │  /api/analytics aggregate-only reporting + export (researchers included)     │
   │  (static)       serves frontend/dist + SPA fallback in production            │
   └───────────────────────────────┬──────────────────────────────────────────┘
                                    │
                          PostgreSQL (Knex)
       cohorts · participants · campaigns · interactions
       learning_modules · quizzes · training_assignments · admin_users

   ┌───────────────────────── React SPA (hash routes) ─────────────────────────┐
   │  #/            public landing                                              │
   │  #/learn       resource library      #/learn/<slug>  lesson + knowledge check │
   │  #/admin       admin console (login → campaigns, cohorts/consent,          │
   │                analytics, compare phases, clone, send)                     │
   │  #/enroll/<token>  the participant's assigned training (email link only)   │
   └────────────────────────────────────────────────────────────────────────────┘
```

**Single origin is a hard requirement, not a preference.** The React client
calls the API with relative paths (`fetch('/api/...')`) and the Express app
registers **no CORS middleware**, so a split frontend/backend deployment fails
in the browser on every request. In production one Node process serves both the
API and the built SPA; in development Vite serves the app on `:5173` and proxies
`/api` back to the backend on `:4000`.

### 5.2 The data model

Eight tables, all UUID-keyed:

- **`cohorts`** — the *unit of consent*. `consent_status` is `pending` /
  `granted` / `withdrawn` (defaults to `pending`, so a fresh cohort is never
  treated as consented by omission).
- **`participants`** — org staff. Stores `cohort_id`, a keyed
  `email_or_phone_hash` (**never** raw email/phone), `role`, `department`, and
  an individual `opted_out` flag. Data minimization by construction.
- **`campaigns`** — one simulation run. `status` lifecycle
  (`draft → active → paused → completed → archived`), `phase_label` for
  re-tests, `enrollment_trigger` (`clicked` or `submitted`),
  `cloned_from_campaign_id` lineage.
- **`interactions`** — behavioral flags + timestamps **only**: `opened`,
  `clicked`, `submitted`, `disclosed` (each with a timestamp) plus the opaque
  `tracking_token`. **No column can hold a submitted value** — this is
  guardrail #1, enforced in the migration with a schema comment and a named
  test on the exact column set. One row per (campaign, participant).
- **`learning_modules`** — CAT lesson content (Markdown body, `published` flag,
  `category`, `slug`).
- **`quizzes`** — per-module knowledge checks with a private answer key and a
  `pass_threshold`.
- **`training_assignments`** — the enrollment loop's record: which participant
  was assigned which module, `assigned_reason`, status
  (`assigned → in_progress → completed`), an opaque `completion_token`, and a
  `notified_at` stamp. Holds no credential-shaped field.
- **`admin_users`** — operators, with a salted **scrypt** password verifier
  (never returned in any response) and one of two roles.

### 5.3 Roles

- **`program_admin`** — manages campaigns, cohorts, participants, operators;
  can send, notify, clone, and move consent.
- **`researcher`** — read/evaluate only. Can see analytics (analysis is their
  job) but cannot write. This is enforced **server-side** on the routes, not
  merely by hiding UI controls (`consent.authz.guardrail`).

### 5.4 Two things that are deliberately *not* linkable

Three surfaces — `/t/<token>`, `/sim/<token>`, and `#/enroll/<token>` — have
**no link pointing at them from anywhere**. That is a guardrail, not an
omission (see [`docs/ROUTES.md`](./ROUTES.md) §2):

- The measurement depends on an *unprompted* arrival — a participant should meet
  the decoy because they believed a lure, not because they browsed to it.
- A per-participant token is not something a page can link to; an entry point
  would have to be a "paste your token" box, which is a guessing oracle against
  someone else's record.
- Linking a participant's tracked link from the console would build a
  person→behaviour map — exactly what the aggregate-only design (guardrail #5)
  exists to prevent.

### 5.5 Two origins for participant links

| Link | Served by | Built from |
|---|---|---|
| `/t/<token>`, `/sim/<token>` | this API | `PUBLIC_BASE_URL` |
| `#/enroll/<token>`, `#/learn` | the React app | `APP_BASE_URL` |

`APP_BASE_URL` defaults to `PUBLIC_BASE_URL`, so a single-origin deployment
needs no extra config. Getting `PUBLIC_BASE_URL` wrong is the most damaging
misconfiguration available — it is the origin a participant's mail client
resolves, so a deployment that forgets it mails links pointing at `localhost`.

### 5.6 Email

A pluggable mailer (`MAIL_PROVIDER`):

- **`console`** (default, hermetic) — records send *metadata only*, dispatches
  nothing over the network. Used in dev, tests, and CI. Under `NODE_ENV=test`
  the console transport is **forced** regardless of config, so a test run can
  never reach the network.
- **`smtp`** — point at a local catcher (Mailpit) to *see* real mail locally, or
  a transactional relay in production. `SMTP_PASS` is never logged, and an SMTP
  error is re-thrown with its error *code* only (provider messages echo the
  recipient address, which must not reach a log — guardrail #6).

---

## 6. Using and testing the full project

### 6.1 Prerequisites

- Node.js ≥ 20
- PostgreSQL (local or containerized) to run the backend against a database
- (Optional) Docker, for a local mail catcher and/or Postgres

### 6.2 First-time local setup

```bash
npm install                                   # installs backend + frontend workspaces

cp backend/.env.example backend/.env          # then edit DATABASE_URL
npm run migrate:latest --workspace backend    # create the schema
npm run seed:run --workspace backend          # demo cohorts, participants, modules, admin
```

The seed provisions the demo **Program Admin** (`admin@example.test` /
`changeme-dev-password`) and six published training modules, including the
`recognizing-phishing` module the enrollment loop assigns.

### 6.3 Run it in development (two processes)

```bash
npm run dev:backend        # http://localhost:4000/health
npm run dev:frontend       # http://localhost:5173  (proxies /api to :4000)
```

Then open **http://localhost:5173**:

- `#/` — public landing
- `#/learn` — the CAT resource library and lessons (public)
- `#/admin` — sign in as the demo admin to reach the console

### 6.4 The admin console

Sign in at `#/admin`. As a Program Admin you can:

- **Campaigns** — create, run lifecycle transitions, open **Analytics**
  (with **Export CSV**), **Compare phases**, **Clone as new phase**, and
  **Send**. (`Send`, `Clone`, `Compare` are Program-Admin only; a Researcher
  never sees them, mirroring the server-side role gate.)
- **Cohorts & consent** — create/edit/delete cohorts, **grant/withdraw
  consent** (behind a confirmation that names how many people it affects), and
  manage the participant roster (add, edit, delete, opt in/out, look up by
  address).

Two properties the **Send** panel deliberately holds to:

- **The roster is transient** — it lives in component state only, never
  `localStorage` or a query string, and is dropped as soon as the send returns.
  The backend stores only a keyed hash, never the raw address.
- **The receipt is aggregate-only** — counts and withholding reasons ("3
  withheld by the consent gate"), never a per-recipient outcome.

### 6.5 Walking the full participant loop (the real demo — Mailpit)

`MAIL_PROVIDER=console` sends nothing, so the tokened links only exist in the
database. To walk the genuine loop with **no URL typing at all**, point the
mailer at a local catcher:

```bash
docker run -d --name catsim-mailpit -p 1025:1025 -p 8025:8025 axllent/mailpit
```

```bash
# backend/.env
MAIL_PROVIDER=smtp
SMTP_HOST=localhost
SMTP_PORT=1025
APP_BASE_URL=http://localhost:5173
```

Then, from the admin console, send a campaign to your own address and read the
inbox at **http://localhost:8025**. The loop:

```
send (console) → click the mail → decoy → submit → disclosure
             → auto-enroll → enrollment mail → training → pass the quiz → completed
```

**No-setup shortcut:** `GET /sim/:token` never looks the token up — it is a
pure stateless render — so `/sim/demo` and `/sim/demo/disclosure` show the whole
Phase 4 decoy/disclosure surface with no email, no DB row, and nothing recorded.
Ideal for reviewing the decoy copy in a presentation.

### 6.6 Automated tests

```bash
npm test                          # all workspace suites (DB/browser-free)
npm test --workspace backend      # Jest + Supertest  (44 test files)
npm test --workspace frontend     # Vitest + Testing Library  (13 test files)
```

The suite is intentionally hermetic — no database and no network required — so
it runs anywhere, including CI. It includes the **named guardrail tests** listed
in §3; those assert the ethical/legal invariants and are marked "do not weaken."

### 6.7 Browser end-to-end (against a live stack)

The Playwright E2E under [`e2e/`](../e2e) drives the full loop against a running
backend + Postgres. It is deliberately outside the root workspaces so `npm test`
stays DB/browser-free.

```bash
# 1) Postgres migrated + seeded
cd backend
DATABASE_URL=postgres://catsim:catsim@localhost:5432/catsim_test \
  npm run migrate:latest && npm run seed:run

# 2) Backend running against that DB
DATABASE_URL=postgres://catsim:catsim@localhost:5432/catsim_test \
  PORT=4000 npm start

# 3) From the repo root
npm run test:e2e
```

The harness reads the opaque **tracking token**, **completion token**, and quiz
**answer key** straight from the database as an out-of-band **test oracle** —
because the product never exposes any of them through an API (that is the whole
point of guardrails #5 and the Phase 7 answer-key rule). No token endpoint is
added for the test.

### 6.8 Deploying (single origin)

```bash
npm ci --include=dev && npm run build   # builds frontend/dist  (--include=dev is required)
npm run bootstrap                       # migrate; seed only a fresh database
npm start                               # serves API + SPA on $PORT
```

`--include=dev` is load-bearing: `NODE_ENV=production` makes npm omit
devDependencies, and `vite` is one, so a plain `npm ci` builds nothing and the
deploy dies on `vite: not found`.

**Render:** [`render.yaml`](../render.yaml) is a Blueprint for one web service +
one Postgres. Because the free tier offers no pre-deploy step,
`backend/scripts/bootstrap.js` runs from the start command — migrating every
boot and seeding only a database that has never been seeded. `SEED_ON_BOOT`
guards this: `auto` (default) seeds only an unseeded DB, `never` skips seeding,
`force` reseeds and **discards collected data**. This guard is load-bearing —
the seeds are destructive and a free instance restarts on every cold start.

### 6.9 Before pointing it at anyone

Walk [`docs/PRE_LAUNCH_CHECKLIST.md`](./PRE_LAUNCH_CHECKLIST.md) — it is a launch
gate, not a description of aspirations. In particular (operator actions per
deployment):

- Override the insecure dev placeholders: `IDENTITY_HASH_SECRET`, `JWT_SECRET`,
  `DATABASE_URL`, `PUBLIC_BASE_URL`, and real `MAIL_PROVIDER` / credentials.
- Confirm `SIM_BRAND_NAME` and `MAIL_FROM` name **no real organization** — the
  decoy is fictional by design and sends `noindex, nofollow`.
- Rotate or remove the seeded demo admin before launch.
- Confirm a signed consent/authorization is on file for **every** cohort you
  mark `granted`, scoped to the organization's own staff.

---

## 7. Quick reference — where things live

| You want… | Look at |
|---|---|
| The build plan / dev spec | [`IMPLEMENTATION_PLAN.md`](../IMPLEMENTATION_PLAN.md) |
| Phase-by-phase history | [`docs/PHASE_LOG.md`](./PHASE_LOG.md) |
| Every route + how a human reaches it | [`docs/ROUTES.md`](./ROUTES.md) |
| The launch gate | [`docs/PRE_LAUNCH_CHECKLIST.md`](./PRE_LAUNCH_CHECKLIST.md) |
| Getting started / deploy notes | [`README.md`](../README.md) |
| The consent gate | `backend/src/services/consent.js` |
| The decoy + discard-on-submit | `backend/src/routes/sim.js`, `backend/src/views/simPages.js` |
| Delivery (transient roster, aggregate receipt) | `backend/src/services/delivery.js` |
| The enrollment loop | `backend/src/services/enrollment.js` |
| Aggregate-only analytics + k-anonymity | `backend/src/services/analytics.js`, `backend/src/repositories/analytics.js` |
| Pause/rollback gate | `backend/src/services/campaignState.js` |
| Central config + every env var | `backend/src/config/index.js` |
| The admin console UI | `frontend/src/admin/` |
| The public learning site UI | `frontend/src/learn/` |
| The browser E2E | `e2e/` (+ [`e2e/README.md`](../e2e/README.md)) |

---

*This overview reflects the repository at Phases 0–11 complete (full MVP). For
the authoritative, test-pinned statement of each guardrail, see
`docs/PRE_LAUNCH_CHECKLIST.md` §1.*
