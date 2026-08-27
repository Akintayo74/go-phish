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
