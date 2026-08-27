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

Phases 0–2 complete (scaffolding; data model & schema; consent & participant
management). Next: **Phase 3 — admin auth + campaign CRUD**. See
[`IMPLEMENTATION_PLAN.md`](./IMPLEMENTATION_PLAN.md) and
[`docs/PHASE_LOG.md`](./docs/PHASE_LOG.md).

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
