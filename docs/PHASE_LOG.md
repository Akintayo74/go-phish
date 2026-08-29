# Phase Log

A short record of what each completed phase delivered, so a fresh session can
resume without re-reading all prior code. See `IMPLEMENTATION_PLAN.md` for the
full plan.

## Phase 0 — Scaffolding & foundations ✅

**Delivered**
- npm workspaces monorepo: `backend/` (Express + PostgreSQL) and `frontend/`
  (React + Vite).
- Backend: app factory (`src/app.js`) separated from server entrypoint
  (`src/index.js`); central config (`src/config`); Knex connection +
  `checkConnection()` (`src/db`); `knexfile.js` with dev/test/production
  envs; `/health` route (200 up / 503 degraded).
- **Guardrail baked in:** `src/middleware/requestLogger.js` logs only an
  allow-list of safe fields (method, path, status, durationMs) and never reads
  `req.body`, query strings, or headers. Enforced by the named test
  `backend/tests/logging.test.js` ("never logs POST body field values").
- Test harness: Jest + Supertest (backend), Vitest + Testing Library
  (frontend). `npm test` runs both. All green; frontend production build OK.
- Root `.env.example` + `backend/.env.example`, `.gitignore` (ignores `.env`,
  `node_modules`, build output), `README.md`.

**Verified**
- `npm test` → 7 tests pass (5 backend, 2 frontend), no warnings.
- Backend boots; `/health` returns 503/`db: down` gracefully with no DB
  running; logger output confirmed to contain only safe fields; 404 JSON works.
- `npm run build` (frontend) succeeds.

**Notes for next phase**
- No PostgreSQL is running in the build environment; `/health` reporting
  `degraded` there is expected. Phase 1 should provision a local/containerized
  Postgres (or point `DATABASE_URL` at one) to run migrations.
- Migration + seed directories are configured in `knexfile.js`
  (`backend/migrations`, `backend/seeds`) but empty — Phase 1 fills them.

## Phase 1 — Data model & schema ✅

**Delivered**
- Seven Knex migrations under `backend/migrations/` building the full backbone:
  `cohorts` (consent unit), `campaigns`, `participants`, `interactions`,
  `learning_modules`, `quizzes`, `training_assignments`. UUID PKs
  (`gen_random_uuid()`), FK relationships, check constraints on status/enum
  fields, and indexes. (`cohorts` is added here because consent is cohort-level
  and load-bearing for guardrail #3; Phase 2 layers CRUD/opt-out on top.)
- **Guardrail #1 (no credentials), enforced at the schema level:**
  `interactions` holds only behavioral flags + timestamps
  (`opened/clicked/submitted/disclosed` + `_at`s, `tracking_token`) — there is
  **no** column able to hold a submitted credential or raw form value.
  `submitted` is a pure boolean. Table/column `COMMENT`s document the invariant.
- **Guardrail #6 (data minimization):** `participants` stores
  `email_or_phone_hash` (keyed HMAC-SHA-256 via `src/lib/hash.js`), never raw
  email/phone; only role/department/cohort + opt-out flag beyond that.
- Repository/query layer under `backend/src/repositories/`: a shared factory
  (`base.js`) plus guardrail-aware `participants` (hashes on write) and
  `interactions` (`markSubmitted` takes **no** value argument — nowhere to put
  one). `index.js` exposes all seven repos.
- Seed data (`backend/seeds/01_demo_data.js`): 2 cohorts (one consented, one
  pending), 3 hashed participants, 1 draft campaign, 3 learning modules, 1 quiz.
  No raw PII, no interaction values.
- Config: `IDENTITY_HASH_SECRET` added to `src/config` and both `.env.example`s.

**Named guardrail tests (two, defense in depth)**
- `tests/schema.interactions.guardrail.test.js` — **DB-free**, always runs in
  CI. Drives the interactions migration through a recording stub and asserts
  the exact column set + that no column name is credential-shaped
  (`password`, `credential`, `form_data`, `otp`, …). Fails the build if the
  migration source drifts.
- `tests/schema.db.test.js` — runs the real migrations against `catsim_test`
  and asserts the applied column set + that all seven tables exist and
  `participants` has no raw email/phone column. Skips with a warning (does not
  fail) when no Postgres is reachable.

**Verified**
- `npm test` → 14 tests pass (12 backend incl. both schema guardrails, 2
  frontend). Migrations + seeds applied to a live Postgres 16;
  `\d interactions` confirms the exact behavioral-only column set.

**Notes for next phase**
- Phase 2 (consent & participant management, *Sonnet 5*): build CRUD/API on top
  of the `cohorts`/`participants` tables + repos already present. Consent
  columns (`consent_status`, per-participant `opted_out`) exist; wire the
  opt-out flow and the "no delivery to non-consented/opted-out targets" rule.
- To run the DB-backed test/migrations locally you need Postgres reachable at
  `DATABASE_URL` (role `catsim`, DBs `catsim_dev` / `catsim_test`).

## Phase 2 — Consent & participant management ✅

**Delivered**
- **Consent service (`src/services/consent.js`) — the single delivery gate**
  (guardrail #3). `isDeliverable(participant, cohort)` is a pure predicate that
  is true **only** when the cohort's `consent_status === 'granted'` **and** the
  participant is not `opted_out`; it fails closed on any missing/malformed
  input. `deliverableParticipants(cohortId)` is the DB-backed enumeration
  delivery (Phase 5) will call — it returns `[]` unless the cohort is granted
  and excludes opted-out members, so a non-consented/opted-out target can never
  even be enumerated. `ineligibilityReason(...)` names the blocking cause for
  admin UIs. **All future targeting must route through this module.**
- **Cohort API (`src/routes/cohorts.js`, mounted `/api/cohorts`):** list /
  create / get / update / delete, plus consent transitions
  `POST /:id/consent/grant` and `/:id/consent/withdraw`. `consent_status` is
  **never** settable via create/update — it moves only through the two
  transition endpoints (which also stamp `consent_granted_at` /
  `consent_withdrawn_at`). Deleting a cohort that still has participants returns
  `409 cohort_has_participants` (the FK is `ON DELETE RESTRICT`), not a 500.
- **Participant API (`src/routes/participants.js`, mounted `/api/participants`):**
  list (optional `?cohort_id=`), create, get, update, delete, plus the
  individual `POST /:id/opt-out` and `/:id/opt-in` flow. Create takes a **raw**
  identifier and hashes it via the repo (guardrail #6) — the raw value is never
  stored and never echoed back in a response; a duplicate identifier maps to
  `409 participant_already_exists` without leaking it.
- **Repo/helpers:** new `src/repositories/cohorts.js` (`grantConsent` /
  `withdrawConsent`); `participants` repo gains `optIn` (reverses opt-out).
  `src/lib/http.js` adds `HttpError` / `asyncHandler` (uses the `status` +
  `publicMessage` contract the app's error handler already honors, so no
  request body is ever echoed in an error).

**Named guardrail test**
- `tests/consent.guardrail.test.js` — **DB-free**. Pins the full truth table of
  `isDeliverable` (only granted-cohort + not-opted-out is deliverable; every
  other combination and all malformed inputs are false) and the
  `ineligibilityReason` mapping. Fails the build if the delivery gate ever
  loosens.
- Route tests (`tests/cohorts.routes.test.js`, `tests/participants.routes.test.js`)
  run with the repositories mocked (no DB); the participant test also asserts
  the posted raw identifier reaches the hashing repo but never appears in any
  response body.

**Verified**
- `npm test` → **35 tests pass** (33 backend incl. the new consent guardrail +
  route suites, 2 frontend).
- Against a live Postgres 16: migrations apply; the DB-backed schema test runs
  (not skipped); an end-to-end smoke run confirmed the gate — deliverable count
  was 0 (cohort pending) → 2 (granted) → 1 (after one opt-out) → 0 (consent
  withdrawn) — and that create never leaks the raw identifier.

**Notes for next phase**
- Phase 3 (admin auth + campaign CRUD, *Sonnet 5*): the cohort/participant APIs
  are unauthenticated for now; Phase 3 adds JWT admin auth and should apply it
  to these `/api` routes. Campaign CRUD layers onto the existing `campaigns`
  table/repo the same way this phase layered onto `cohorts`/`participants`.
- Phase 5 (delivery) MUST use `consent.deliverableParticipants` /
  `consent.isDeliverable` as the only path to a send target — do not re-derive
  eligibility inline.

## Phase 3 — Admin auth + campaign CRUD skeleton ✅

**Delivered**
- **Dependency-free auth primitives** (Node `crypto` only — no jsonwebtoken /
  bcrypt / argon2 added): `src/lib/jwt.js` (HS256 sign/verify with `exp` and a
  constant-time signature compare; the header alg is fixed and re-derived on
  verify, so the "alg: none" downgrade is impossible) and `src/lib/password.js`
  (salted **scrypt** verifier, stored as `scrypt$N$salt$hash`, constant-time
  compare). `src/lib/roles.js` defines the two roles (`program_admin`,
  `researcher`) in one place, kept in sync with the DB check constraint.
- **`admin_users` table** (migration `20260828120001`): operator accounts for
  the console — id/name/email(unique, lower-cased)/`password_hash`/role(checked)
  + timestamps. A column `COMMENT` records that `password_hash` is an operator
  login verifier and is **unrelated** to guardrail #1 (which concerns
  *simulation-target* credentials on `interactions`, still untouched).
- **`adminUsers` repo** (`src/repositories/adminUsers.js`): guardrail-aware —
  `createWithPassword` hashes before insert (a raw password never reaches the DB
  layer), `findByEmail` normalizes case, and `toPublic(row)` strips
  `password_hash` so it can never be serialized. Every admin-user response goes
  through `toPublic`.
- **Auth middleware** (`src/middleware/auth.js`): `requireAuth` verifies the
  `Authorization: Bearer` token statelessly (no DB round-trip) and attaches
  `req.admin`; `requireRole(...roles)` gates by role. Both fail closed.
- **Auth API** (`/api/auth`): public `POST /login` (opaque `invalid_credentials`
  on either unknown email or wrong password — no user enumeration; always runs a
  verify to keep timing uniform), authenticated `GET /me` (from the token, no DB
  lookup). Neither the password nor the hash appears in any response.
- **Admin-user provisioning** (`/api/admin/users`, `program_admin` only): list +
  create operators (min-8 password, validated role, duplicate email → 409). No
  public self-registration.
- **Campaign CRUD skeleton** (`/api/campaigns`) — **no sending happens here**
  (delivery is Phase 5). Reads are open to any authenticated operator; create /
  edit / delete / lifecycle are `program_admin`-only (researchers are read-only,
  matching their evaluator role). Like cohort consent, `status` is never settable
  via create/update — it moves only through the transition endpoints
  (`/activate`, `/pause`, `/complete`, `/archive`) which enforce a small state
  machine (`draft→active→paused…`, `archived` terminal); an illegal jump is a
  clean 409. Only a `draft` campaign may be deleted; live ones must be archived.
- **Auth applied to the Phase 2 routes** (per the Phase 2 hand-off note):
  `/api/cohorts` and `/api/participants` now require a valid admin session.
- **`campaigns` repo** gains `setStatus`; seed `02_admin_users.js` adds a demo
  Program Admin + Researcher (dev-only password `changeme-dev-password`).
  `JWT_SECRET` / `JWT_EXPIRES_IN_SECONDS` added to config + both `.env.example`s.
- **Frontend admin shell**: `#/admin` hash route (no router dependency) mounts
  `src/admin/AdminConsole.jsx` — login → campaign list with create + lifecycle
  controls; write controls render only for Program Admins (researchers get a
  read-only view), mirroring the backend gating. `src/admin/api.js` is the
  token-aware fetch client.

**Named guardrail test**
- `tests/admin.credentials.guardrail.test.js` — pins that `toPublic` strips
  `password_hash` (and doesn't mutate the row) and that the scrypt verifier is
  one-way and never contains the raw password. `tests/auth.routes.test.js`
  additionally asserts the login response body carries neither the password nor
  the hash and that login does not enumerate users. The Phase 0 logging
  guardrail (bodies never logged) already covers the posted password.

**Verified**
- `npm test` → **84 tests pass** (77 backend + 7 frontend); frontend production
  build OK. Against a live Postgres 16 the migrations apply (8 total),
  `\d admin_users` shows the checked-role + unique-email shape, the DB-backed
  schema test runs (not skipped), and an end-to-end smoke confirmed: login (no
  hash leak) → wrong-password/opaque-401 → unauth-401 → create(draft) → activate
  → pause → illegal-transition-409, researcher forbidden to create but able to
  read, and operator creation never leaking the hash.

**Notes for next phase**
- Phase 4 (simulated landing + dummy form + disclosure, *Opus 5*) is the
  highest-sensitivity component: the form handler sets `submitted = true`,
  **discards** posted values, and redirects to disclosure. It does not need the
  admin auth added here (it is participant-facing), but it MUST keep the
  no-persisted-field-values invariant and route-level body exclusion.
- Phase 5 (delivery) will target campaigns created here; a campaign must be
  `active` to send (enforce at send time), and targeting still routes only
  through `consent.deliverableParticipants`.
- Admin auth is now required on `/api/cohorts` and `/api/participants`; any new
  admin-facing API should mount behind `requireAuth` too.

## Phase 4 — Simulated landing page + dummy form + disclosure ✅

**Delivered** (highest-sensitivity component; built for independent review)
- **Simulated sim routes (`src/routes/sim.js`, mounted `/sim`)** — participant-
  facing and intentionally **unauthenticated** (reached via a tracked link, not
  the admin console). Keyed by an opaque `:token` that maps to one
  `interactions` row (the token is minted in Phase 5; Phase 4 records against it
  when present). Three routes:
  - `GET /sim/:token` — renders the generic, fictional sign-in page. Pure render,
    **no DB write** and no token lookup, so it can't leak whether a token is
    valid (marking `clicked` belongs to the Phase 5 tracked-link redirect).
  - `POST /sim/:token` — the sensitive path. It **never reads `req.body`**; it
    looks the interaction up by token and, only if found and not already marked,
    calls `interactions.markSubmitted(id)` (no value argument — guardrail #1),
    then **303-redirects to the disclosure page**. Posted form values are
    discarded entirely.
  - `GET /sim/:token/disclosure` — records `disclosed = true` (guardrail #4) and
    renders the disclosure page. Shown **even for an unknown token**, so a
    participant always learns it was a simulation.
- **Server-rendered HTML views (`src/views/simPages.js`)** — deliberately
  server-side (not React): the decoy form and the handler that discards its
  values live in one auditable place, with **no client-side JavaScript and no
  external resources**, so nothing in the participant's browser could stash or
  exfiltrate a keystroke. The landing page is a **generic, fictional** corporate
  sign-in (guardrail: no real-brand impersonation) driven by the configurable
  `SIM_BRAND_NAME` placeholder. The disclosure page reveals the simulation,
  states plainly that nothing typed was captured or stored, avoids punitive
  framing, and links to awareness training (`SIM_TRAINING_URL`, wired to the CAT
  site in Phase 6+). All interpolated values are HTML-escaped; the token is also
  `encodeURIComponent`-ed into URLs.
- **Config**: `simBrandName` / `simTrainingUrl` added to `src/config` and both
  `.env.example`s. No new dependencies, no schema/migration changes (the
  `interactions` table from Phase 1 already has exactly the behavioral flags this
  phase sets, and — by design — nowhere to put a submitted value).

**Named guardrail test**
- `tests/sim.form.guardrail.test.js` — posts credential-shaped fields to the real
  POST handler and proves three ways that submitted values go nowhere: (1) the
  only interaction write is `markSubmitted(id)` with **no value argument** and no
  secret reaches any repo method; (2) the request-logger sink never sees the
  values; (3) the redirect response never echoes them. Also pins that an unknown
  token still discards + discloses, and that an already-submitted interaction is
  not re-marked. Do not weaken or delete.
- `tests/sim.routes.test.js` — route contract: landing renders an HTML form
  posting back to its token path, is public and stateless on render; disclosure
  renders and marks `disclosed` (and still discloses for an unknown token,
  idempotently); POST marks submitted and 303s to disclosure.

**Verified**
- `npm test` → **93 tests pass** (86 backend incl. the two new sim suites, 7
  frontend). The DB-backed schema test skips gracefully with no Postgres, as in
  prior phases. Standalone render check confirms the pages carry the expected
  form, contain no `<script>` and no external resources, and that a hostile
  token cannot break out of the markup.

**Notes for next phase**
- Phase 5 (interaction tracking + delivery, *Sonnet 5*) mints the per-participant
  `tracking_token`, creates the `interactions` row, and builds the tracked-link
  route that sets `opened`/`clicked` and then **redirects to `GET /sim/:token`**
  (this phase's landing page). Targeting still routes only through
  `consent.deliverableParticipants`; a campaign must be `active` to send.
- The disclosure's training link (`SIM_TRAINING_URL`) currently defaults to `/`;
  Phase 6 should point it at the CAT learning site, and Phase 8's enrollment loop
  fires off `submitted = true` (or `clicked`, per campaign strictness).

## Phase 5 — Interaction tracking + campaign delivery ✅

**Delivered**
- **Token minting (`src/lib/token.js`)** — `generateToken()` produces a 256-bit
  (32-byte) uniform-random, url-safe (base64url) opaque routing identifier. It is
  not a credential and not derived from any participant data, so it leaks nothing
  and can't be enumerated; the `tracking_token` UNIQUE constraint is the final
  collision backstop. The interactions repo gained `createForTarget` (mints the
  token + row for a `(campaign, participant)`) and `findByCampaignAndParticipant`
  (so a re-send reuses the same token). **No schema change** — the Phase 1
  `interactions` table already carries exactly the behavioral flags this phase
  sets, and by design has nowhere to put a value.
- **Tracking routes (`src/routes/track.js`, mounted `/t`)** — participant-facing,
  **unauthenticated**, behavioral-flags-only:
  - `GET /t/:token` — marks `clicked` (which implies `opened`), then **302-redirects
    to the Phase 4 decoy page `GET /sim/:token`**. Redirects for any token, known
    or not, so token validity never leaks.
  - `GET /t/:token/pixel.gif` — optional open pixel: marks `opened` and returns a
    1×1 transparent GIF with `no-store` headers, again for any token.
- **Pluggable mailer (`src/services/mailer.js`)** — delivery depends only on a
  small `send({ to, subject, html, text })` contract, so a real transactional
  provider swaps in without touching delivery logic. Default provider is a
  **hermetic `console`** transport (used by dev/CI/tests) that dispatches nothing
  and records **metadata only** (a synthetic message id + status) — never the
  recipient, subject, body, or API key (guardrail #2). An unknown provider fails
  loudly (fail closed — no silent non-send).
- **Email template (`src/views/emailTemplates.js`)** — `renderSimulationEmail`
  returns `{ subject, html, text }` for a **generic/fictional** "verify your
  account" lure (guardrail: no real-brand impersonation) whose only action is the
  tracked click — **no form, no input, no attachment**. The open pixel is appended
  only when a `pixelUrl` is passed. All interpolated values are HTML-escaped.
- **Delivery service (`src/services/delivery.js`)** — GUARDRAIL-CRITICAL
  orchestrator. `sendCampaign({ campaignId, recipients, resend })`:
  - loads the campaign and **requires `status === 'active'`** (draft/paused/
    completed/archived → 409; this also respects the pause/rollback guardrail);
  - **data minimization (guardrail #6):** because only a keyed hash of each
    address is stored, the admin supplies the raw roster transiently; each address
    is hashed via `lib/hash` to match a stored participant, used **only** as the
    mail `to`, and **never persisted**;
  - **consent gate (guardrail #3):** every recipient is run through the single
    `isDeliverable` predicate from `services/consent.js`; a non-consented or
    opted-out target is never handed to the mailer;
  - dedupes the roster, skips unknown / already-sent targets (reusing the existing
    token on `resend`), throttles sends to `SEND_RATE_PER_SECOND`, and returns an
    **aggregate summary only** (counts per outcome + named ineligibility reasons —
    no per-individual result, guardrail #5).
- **Send endpoint** — `POST /api/campaigns/:id/send` (Program Admin only;
  researchers 403) validates `recipients` and forwards to the delivery service.
  The raw roster in the body is excluded from logs by the global logger.
- **Config**: `publicBaseUrl` (`PUBLIC_BASE_URL`, builds the `/t/<token>` link),
  `mailProvider` / `mailFrom` / `mailApiKey`, and `sendRatePerSecond` added to
  `src/config` and both `.env.example`s (the root file's Phase-5 placeholders were
  reconciled to the implemented variable names). Frontend `api.js` gained a
  forward-looking `sendCampaign` client method. **No new dependencies.**

**Named guardrail test**
- `tests/delivery.guardrail.test.js` — drives `sendCampaign` over a roster
  spanning every deliverability case and proves: (1) **only** the granted,
  opted-in target is emailed — opted-out and non-granted cohorts are never sent,
  with the blocking reasons named; (2) an interaction row is created only for the
  deliverable target, with routing fields only; (3) the raw recipient address is
  **never written to any repository**. Do not weaken or delete.

**Other tests** (all DB-free)
- `tests/token.test.js` — url-safety, entropy/length, no collisions across 10k
  draws.
- `tests/mailer.test.js` — console provider records metadata only (recipient,
  subject, body never reach the sink or console), fails closed on unknown provider.
- `tests/emailTemplates.test.js` — embeds the tracked link, has no form/input,
  appends the pixel only when asked, escapes hostile brand/token.
- `tests/track.routes.test.js` — clicked→redirect and opened→GIF behavior; unknown
  token leaks nothing; no double-marking.
- `tests/delivery.service.test.js` — status gating (404/409/400), happy path with
  the tracked link, roster dedupe, unknown/already-sent skips, `resend` reuse, and
  a failed send not aborting the batch.
- `tests/send.routes.test.js` — route wiring: 401/403 gating, `recipients`
  validation, forwards to the service and returns its summary, surfaces a 409.

**Verified**
- `npm test` → **129 tests pass** (122 backend incl. the six new Phase-5 suites,
  7 frontend). DB-backed schema test skips gracefully with no Postgres, as before.
  App boots cleanly with the new `/t` routes mounted.

**Notes for next phase**
- Unattended **scheduled sending is intentionally not automated**: the system
  never stores addresses (guardrail #6), so a background worker has no roster to
  send. `campaigns.scheduled_send_at` remains an advisory window; the admin runs
  the send (roster in hand) within it. A future scheduler would need an encrypted,
  opt-in roster vault — out of MVP scope.
- Phase 8's enrollment loop keys off the `interactions` flags this phase now
  populates (`clicked` / `submitted`). Phase 9 analytics read the same flags for
  the aggregate four-tier breakdown.
