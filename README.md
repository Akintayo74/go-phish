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

Phases 0–4 complete (scaffolding; data model & schema; consent & participant
management; admin auth + campaign CRUD skeleton; simulated landing page + dummy
form + disclosure). Next: **Phase 5 — interaction tracking + campaign delivery**.
See [`IMPLEMENTATION_PLAN.md`](./IMPLEMENTATION_PLAN.md) and
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
never persisted, logged, or echoed — do not weaken it. Delivery (minting the
token and the tracked-link redirect into this page) is Phase 5.
