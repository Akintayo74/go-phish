# CAT-Sim Pre-Launch Checklist (Phase 11)

The Dev Guide requires a walk of the pre-launch checklist before the system is
pointed at real staff. This document is that walk: every item names **where the
control lives** and the **named test** that pins it, so a reviewer can verify the
guarantee rather than take it on faith. It is a launch gate, not a description of
aspirations — an unchecked box blocks go-live.

Legend: ✅ built & tested · 🔧 operator action required per deployment.

---

## 1. Guardrails (the non-negotiables — IMPLEMENTATION_PLAN.md §1)

| # | Guardrail | Where enforced | Named test |
|---|---|---|---|
| 1 | **No real credentials, ever.** `interactions` has no column able to hold a submitted value; the form handler never reads `req.body`; `markSubmitted` takes no value argument. | `migrations/…_create_interactions.js`, `routes/sim.js`, `repositories/interactions.js` | `schema.interactions.guardrail`, `schema.db`, `sim.form.guardrail`, **`system.credential.audit`** |
| 2 | **POST bodies excluded from logs** (globally). | `middleware/requestLogger.js` | `logging`, **`system.credential.audit`** |
| 3 | **Consent-gated delivery.** Every target routes through the single `isDeliverable` predicate; fail-closed. Consent itself moves only through the two transition endpoints, and only for a Program Admin. | `services/consent.js`, `services/delivery.js`, `services/enrollment.js`, `routes/cohorts.js`, `routes/participants.js` | `consent.guardrail`, `delivery.guardrail`, `enrollment.guardrail`, **`consent.authz.guardrail`** |
| 4 | **Transparency / disclosure.** Every simulated interaction ends at a disclosure page — shown even for an unknown token and even when the campaign is paused. | `routes/sim.js`, `views/simPages.js` | `sim.routes`, `sim.form.guardrail`, **`pause.rollback.guardrail`** |
| 5 | **Aggregate-only reporting.** No per-individual result in any management view; k-anonymity suppression on small groups; send/notify receipts are counts only. The participant roster is deliberately never joined to `interactions`. | `services/analytics.js`, `repositories/analytics.js`, `services/delivery.js`, `services/enrollment.js`, `frontend/src/admin/ParticipantRoster.jsx` | `analytics.guardrail`, `delivery.guardrail`, `enrollment.guardrail`, `ParticipantRoster` (frontend), **`system.loop.integration`** |
| 6 | **Data minimization.** Only a keyed hash of a contact is stored; raw addresses supplied transiently and never persisted. | `lib/hash.js`, `repositories/participants.js`, `services/delivery.js`, `services/enrollment.js` | `delivery.guardrail`, `enrollment.guardrail`, **`system.credential.audit`** |

All six re-verified against the **integrated** system in Phase 11 — see
`system.credential.audit` (whole-system credential-leak audit across logs,
console/traces, response bodies + headers, and the persisted store) and
`system.loop.integration` (the full send→…→completion loop end to end).

---

## 2. Simulation content & ethics

- ✅ **No real-brand impersonation.** The decoy sign-in and the lure email use a
  generic, fictional brand placeholder (`SIM_BRAND_NAME`, default
  `ACME Corp — Staff Portal`) and a fictional from-address
  (`MAIL_FROM`, `…@catsim.invalid`). *Tests:* `emailTemplates`, `sim.routes`.
  🔧 Confirm your configured `SIM_BRAND_NAME` / `MAIL_FROM` do not name a real org.
- ✅ **Non-punitive framing** on the disclosure and enrollment email. *Tests:*
  `emailTemplates`, `sim.routes`.
- ✅ **No client-side JavaScript on the decoy** — the sensitive form and its
  discard-on-submit handler are one auditable server-rendered file with no
  external resources. *Test:* `sim.routes` (+ Phase 4 standalone render check).
- ✅ **Disclosure link points at real training** (`SIM_TRAINING_URL`, default the
  CAT learning site).

---

## 3. Pause / rollback (Phase 11)

- ✅ **Sending** is refused unless the campaign is `active`
  (draft/paused/completed/archived → 409). *Test:* `delivery.service`.
- ✅ **Recording + enrollment halt on pause.** While a campaign is not `active`,
  its tracked links record no new behavioral flags and trigger no new
  enrollment; the participant still reaches the decoy (validity never leaks) and
  the disclosure still renders (guardrail #4). Enforced at the route
  (`services/campaignState.js`) and again, defense-in-depth, in
  `services/enrollment.js`. *Test:* **`pause.rollback.guardrail`**.
- ✅ **Lifecycle state machine** rejects illegal transitions (e.g. reviving an
  archived campaign) with a clean 409. *Test:* `campaigns.routes`.
- 🔧 **Rollback runbook:** to halt a live campaign, `POST /api/campaigns/:id/pause`
  (Program Admin). Re-arm with `/activate`; end it with `/complete` or
  `/archive`. Behavioral data already collected is retained (research record);
  new collection stops immediately.

---

## 4. Load & performance

- ✅ **Email send holds up over a large cohort** and honors the per-second
  throttle (`SEND_RATE_PER_SECOND`); dedupes repeats; a subset of failing sends
  does not abort the batch. *Test:* **`delivery.loadtest`** (1,000-recipient
  roster).
- 🔧 Set `SEND_RATE_PER_SECOND` to your provider's documented limit before a
  large send.

---

## 5. End-to-end verification

- ✅ **DB-free integrated loop** runs in CI: send → click → submit → disclosure →
  auto-enroll → training completion, with the guardrail assertions inline.
  *Test:* **`system.loop.integration`**.
- ✅ **Browser E2E** of the same loop against a live stack (`/e2e`, Playwright),
  including the pause/rollback check. 🔧 Run `npm run test:e2e` against a migrated
  + seeded database and a running backend (see `e2e/README.md`).

---

## 6. Secrets & configuration (operator, per deployment) 🔧

The dev defaults are insecure placeholders and MUST be overridden in production:

- `IDENTITY_HASH_SECRET` — keyed-hash secret for contact identifiers. A weak/known
  value makes the stored hashes guessable. Set a strong random value.
- `JWT_SECRET` — admin-session signing key. A known value lets sessions be forged.
- `DATABASE_URL` — point at the production database (sandboxed/isolated infra).
- `PUBLIC_BASE_URL` — the externally reachable origin the tracked links resolve to
  (not `localhost`).
- `MAIL_PROVIDER` / `MAIL_API_KEY` — a real transactional provider + credentials
  (default is the hermetic `console` transport that sends nothing).
- `SIM_BRAND_NAME` / `MAIL_FROM` — confirm generic/fictional (no real org).
- Rotate the seeded demo admin password (`changeme-dev-password`) or remove the
  demo operators before launch.

---

## 7. Data protection & consent (NDPC-aligned)

- ✅ Consent is captured at the **cohort** level and is the only gate to delivery;
  individual **opt-out** is always honored. *Tests:* `consent.guardrail`,
  `cohorts.routes`, `participants.routes`.
- ✅ **Consent is manageable without a database client.** The admin console's
  *Cohorts & consent* area shows each cohort's consent state and head count,
  and carries the grant / withdraw transitions behind a confirmation that
  names how many people the change affects. *Tests:* `ConsentControl`,
  `CohortPanel` (frontend).
- ✅ **An individual opt-out is performable by the operator.** Participants are
  pseudonymous, so the console resolves a raw address to its participant row
  (`POST /api/participants/lookup`, body not query, never echoed) and offers
  opt-out on the match. *Tests:* `participants.routes`, `ParticipantRoster`
  (frontend).
- ✅ **Only a Program Admin may move consent or the roster.** A Researcher
  session is read-only on both routers, enforced server-side rather than by
  hiding console controls. *Test:* **`consent.authz.guardrail`**.
- ✅ Stored data is minimized to role/department/cohort + behavioral flags +
  timestamps; no raw PII, no submitted values. *Tests:* `schema.db`,
  `delivery.guardrail`.
- ✅ Reporting is aggregate-only with small-group suppression. *Test:*
  `analytics.guardrail`.
- 🔧 Confirm a signed consent/authorization is on file for every cohort you mark
  `granted`, and that the engagement is scoped to the organization's own staff.

---

## Sign-off

- [ ] Guardrails #1–#6 verified (§1) — automated suite green, incl. the Phase 11
      integrated audit.
- [ ] Simulation content reviewed for brand-neutrality and non-punitive tone (§2).
- [ ] Pause/rollback runbook understood; a test pause was exercised (§3).
- [ ] Send throttle set to the provider's limit; load test reviewed (§4).
- [ ] E2E run green against a staging stack (§5).
- [ ] All production secrets/config overridden; demo admin rotated/removed (§6).
- [ ] Consent/authorization on file for every targeted cohort (§7).

> Run the full automated suite from the repo root with `npm test`
> (backend Jest + frontend Vitest). Run the browser E2E with `npm run test:e2e`.
