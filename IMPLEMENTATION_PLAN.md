# CAT-Sim — Phased Implementation Plan

> Build plan derived from **CAT_Sim_PRD_1** (product requirements) and
> **CAT_Sim_MVP_Dev_Guide** (developer build guide).
>
> CAT-Sim is a two-part system: (1) a **consent-based phishing simulation**
> run against an organization's own staff to measure susceptibility, and
> (2) a public **Cybersecurity Awareness Training (CAT)** platform. Anyone
> who falls for the simulation is auto-enrolled into targeted training,
> closing the loop between "measured vulnerability" and "targeted education."

---

## 0. How to use this document

Each **phase** below is scoped to be completed in a **single Claude Code
session under ~200k tokens of context**. A phase is self-contained: a fresh
session can pick it up by reading *this document* + the code from prior
phases, without needing to reload the entire history.

**Every session, before writing code, re-read Section 1 (Non-negotiable
guardrails).** These are correctness requirements, not preferences — several
carry legal and ethical weight and are the reason specific phases are
assigned the stronger model.

At the end of each phase: run the phase's tests, commit, push, and tick the
checklist item here so the next session knows where the boundary is.

---

## 1. Non-negotiable guardrails (read before anything else)

These come straight from the PRD's ethical/legal section and the Dev Guide's
"requirement, not optional" notes. They apply to **every** phase:

1. **No real credentials, ever.** The `Interaction` table must have **no
   column** capable of holding a submitted username/password. Enforced at the
   **schema level**, not just in app logic, so a future dev cannot
   accidentally add credential capture. The dummy form handler discards posted
   values and retains only a `submitted: yes/no` boolean.
2. **POST bodies excluded from logs** on the simulated-form route (and
   globally, defensively) — no credential-shaped data in access logs, error
   traces, query strings, or headers.
3. **Consent-gated delivery.** No campaign can send to a participant who is
   not in a consented, opted-in cohort. Build consent management *before*
   delivery.
4. **Transparency / disclosure.** Every simulated interaction ends in a
   disclosure page telling the participant it was a simulation.
5. **Aggregate-only reporting.** Management/researcher-facing views group by
   cohort/department and **never** expose a per-individual result. Per-person
   lookups exist only as backend logic for the enrollment loop.
6. **No punitive framing, sandboxed infra, data minimization** (NDPC-aligned):
   store only role/department/cohort + click/submit/timestamp flags.

A phase that touches any of these must include an **explicit, named test**
proving the guardrail holds (e.g. `form handler never persists field values`).

---

## 2. Tech stack (from the Dev Guide)

| Layer | Choice |
|---|---|
| Backend | Node.js + Express (REST) |
| Database | PostgreSQL |
| Frontend | React (admin console + public CAT site) |
| Email | Transactional email API (SendGrid / Mailgun / SES) |
| Auth | JWT sessions (admin/researcher only; CAT site mostly public) |
| Hosting | Single small cloud instance (Render/Heroku-class) for MVP |
| Tests | Jest + Supertest (backend); Vitest + Testing Library (frontend); Playwright for the E2E loop |

Suggested repo shape: a monorepo with `/backend`, `/frontend`, `/docs`, and
`/migrations`.

---

## 3. Phase breakdown

**12 phases total (Phase 0 – Phase 11).** Dependencies are noted; Phases 6–7
(CAT platform) have **no dependency** on the simulation logic and can be built
in parallel / out of order if convenient.

Model column: **Opus 5** where the work is security-, ethics-, or
correctness-critical (get it right once, subtle invariants), **Sonnet 5** for
well-specified CRUD/UI/integration work where this plan already pins down the
design.

| # | Phase | Depends on | Model | Why this model |
|---|---|---|---|---|
| 0 | Scaffolding & foundations ✅ | — | **Sonnet 5** | Mechanical boilerplate |
| 1 | Data model & schema | 0 | **Opus 5** | Backbone + schema-level credential-safety invariant |
| 2 | Consent & participant management | 1 | **Sonnet 5** | Well-specified CRUD (consent is load-bearing but spelled out) |
| 3 | Admin auth + campaign CRUD skeleton | 1 | **Sonnet 5** | Standard JWT + CRUD |
| 4 | Simulated landing page + dummy form + disclosure | 1 | **Opus 5** | **Highest-sensitivity piece**; discard-values + no-log invariant |
| 5 | Interaction tracking + campaign delivery | 2,3,4 | **Sonnet 5** | Tokened links + email integration, design pinned here |
| 6 | CAT platform — lesson modules + resource library | 0 | **Sonnet 5** | Content + React rendering |
| 7 | CAT platform — quiz engine + knowledge checks | 6 | **Sonnet 5** | Scoring logic + UI |
| 8 | Automatic enrollment loop | 4,5,7 | **Sonnet 5** | Trigger → assignment → notify → completion tracking |
| 9 | Analytics dashboard | 5,8 | **Opus 5** | Aggregate-only privacy invariant + phase-over-phase math |
| 10 | Phase II / re-test support | 9 | **Sonnet 5** | Campaign cloning + side-by-side comparison |
| 11 | E2E testing, security & log audit, pre-launch hardening | all | **Opus 5** | Whole-system credential-leak audit; pause/rollback; load test |

### Phase detail

**Phase 0 — Scaffolding & foundations** · *Sonnet 5*
- Monorepo (`/backend`, `/frontend`, `/migrations`, `/docs`), package setup.
- Express server skeleton + health check; PostgreSQL connection + migration
  tooling (Knex or node-pg-migrate).
- Central config, `.env.example`, secrets handling.
- **Global request logging configured to exclude POST bodies** (foundational
  guardrail #2) + test harness (Jest/Supertest, Vitest) wired to CI scripts.

**Phase 1 — Data model & schema** · *Opus 5*
- Migrations for `Campaign, Participant, Interaction, TrainingAssignment,
  LearningModule, Quiz` per the Dev Guide's schema.
- `Interaction` has **no credential column**; add a schema comment + a named
  test asserting the column set, so drift is caught.
- `Participant.email_or_phone_hash` (hashed, not raw PII where feasible).
- Repository/query layer + seed data.

**Phase 2 — Consent & participant management** · *Sonnet 5* (Build Order Step 1)
- CRUD for participants and cohorts; consent status field + opt-out flow.
- Guardrail: delivery endpoints (later) must refuse non-consented targets.

**Phase 3 — Admin auth + campaign CRUD skeleton** · *Sonnet 5* (Step 2)
- JWT admin login; role support (Program Admin, Researcher/Evaluator).
- Campaign create/edit/pause (no sending yet); minimal admin UI shell.

**Phase 4 — Simulated landing page + dummy form + disclosure** · *Opus 5* (Step 3)
- Generic, fictional login-style page (do **not** clone a real brand).
- Form handler: sets `submitted = true`, **discards posted values**,
  redirects to disclosure page.
- Route-level logging excludes POST body; **explicit named test** that no
  field values are persisted anywhere; built for independent (non-author)
  review — this is the highest-sensitivity component.

**Phase 5 — Interaction tracking + campaign delivery** · *Sonnet 5* (Steps 4–5)
- Unique per-participant tokened link → sets `opened/clicked` → redirects to
  Phase 4 landing page. Optional open-tracking pixel.
- Email provider integration; templated send embedding the tracking link;
  manual "send now" first, scheduled window after. Respect provider rate
  limits.

**Phase 6 — CAT platform: lesson modules + resource library** · *Sonnet 5* (Step 6, parallelizable)
- Public learning site (not gated behind failing a sim). Markdown → React
  modules: what phishing/social engineering is; Nigerian-context tactics (SIM
  swap, smishing, vishing, impersonation); "what to do if you clicked";
  "how to recognize a phishing attempt." Resource library for ongoing reference.

**Phase 7 — CAT platform: quiz engine + knowledge checks** · *Sonnet 5* (Step 6 cont.)
- Quiz component with pass/fail scoring against `Quiz.pass_threshold`;
  per-module knowledge checks; results feed completion tracking.

**Phase 8 — Automatic enrollment loop** · *Sonnet 5* (Step 7)
- On `submitted = true` (or `clicked`, per configured strictness) auto-create
  a `TrainingAssignment` with `assigned_reason`; notify participant by email;
  completion tracking; optional re-simulation scheduling hook.

**Phase 9 — Analytics dashboard** · *Opus 5* (Step 8)
- Aggregate-only queries: click rate, submission rate, four-tier breakdown
  (no action / opened only / clicked only / clicked+submitted), grouped by
  cohort/department. Phase-over-phase comparison. Anonymized export.
- **Guardrail:** no per-individual result in any management-facing view.

**Phase 10 — Phase II / re-test support** · *Sonnet 5* (Step 9)
- Clone a campaign as a new phase against same/updated cohort; Phase I vs
  Phase II side-by-side comparison view (the core research payoff).

**Phase 11 — E2E testing, security & log audit, pre-launch hardening** · *Opus 5*
- Playwright E2E of the full loop: send → click → submit → auto-enroll →
  training completion.
- Whole-system credential-leak audit (logs, headers, query strings, traces);
  the named "no persisted field values" test re-run against the integrated
  system; load-test email sending; campaign **pause/rollback** mechanism.
- Walk the Dev Guide's Pre-Launch Checklist.

---

## 4. Model recommendation summary

- **Opus 5 (4 phases): 1, 4, 9, 11** — the schema invariant, the sensitive
  dummy-form component, the aggregate-only analytics guardrail, and the final
  whole-system security audit. These carry subtle correctness/ethics
  invariants where a mistake is costly and hard to detect later.
- **Sonnet 5 (8 phases): 0, 2, 3, 5, 6, 7, 8, 10** — scaffolding, CRUD, UI,
  and integration work where this plan already pins the design. Fast and
  cost-effective; escalate an individual phase to Opus only if it turns out
  messier than expected.

## 5. Total effort

**~12 phases**, each a self-contained <200k-token session. Phases 6–7 can run
in parallel with 3–5 if you have the bandwidth, since the CAT platform has no
dependency on the simulation backend. Explicitly **deferred past MVP** (do not
build in these phases): SMS/smishing delivery, browser extension, org-wide
scale, CMS authoring, in-app perception surveys.
