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
