# CAT-Sim end-to-end tests (Phase 11)

Playwright E2E of the **full simulation → training loop**:

```
send (admin API) → click (browser) → submit decoy (browser) → disclosure (browser)
                 → auto-enroll → training completion
```

plus a pause/rollback check (a paused campaign records no further interactions
while the participant still reaches the decoy).

These tests drive a **live stack** and are deliberately **not** part of the root
`npm` workspaces, so `npm install` / `npm test` at the repo root stay DB- and
browser-free. Run them explicitly when you have a stack up.

## Why the tests read the database

The CAT-Sim API is aggregate-only by design: a send returns counts, never the
per-participant **tracking token** (guardrail #5), and the **completion token** is
only ever emailed. The harness therefore reads those opaque tokens straight from
the database it shares with the backend (`e2e/helpers/db.js`) as an out-of-band
**test oracle**. This does not weaken the product — no token endpoint is added;
the test simply peeks at fixtures the way E2E harnesses normally do. The quiz
answer key is read the same way, purely so the harness can drive a genuine PASS
(the product still never exposes the key to a client — Phase 7 guardrail).

## Prerequisites

1. **Postgres** reachable at `DATABASE_URL`, migrated and seeded:
   ```bash
   cd ../backend
   DATABASE_URL=postgres://catsim:catsim@localhost:5432/catsim_test \
     npm run migrate:latest && npm run seed:run
   ```
   The seed provisions the demo Program Admin (`admin@example.test` /
   `changeme-dev-password`) and the published `recognizing-phishing` training
   module the enrollment loop assigns.

2. **Backend** running against that same database:
   ```bash
   cd ../backend
   DATABASE_URL=postgres://catsim:catsim@localhost:5432/catsim_test \
     PORT=4000 npm start
   ```

3. **Playwright browsers** installed (first run only):
   ```bash
   cd ../e2e
   npm install
   npx playwright install chromium
   ```

## Run

```bash
cd e2e
BACKEND_URL=http://localhost:4000 \
DATABASE_URL=postgres://catsim:catsim@localhost:5432/catsim_test \
  npm test
```

Or from the repo root: `npm run test:e2e` (passes the same env through).

## Configuration (env vars)

| Var | Default | Purpose |
|---|---|---|
| `BACKEND_URL` | `http://localhost:4000` | Origin serving `/t`, `/sim`, `/api` |
| `DATABASE_URL` | `…/catsim_test` | The DB the backend uses (token/answer oracle) |
| `ADMIN_EMAIL` | `admin@example.test` | Program Admin used for setup |
| `ADMIN_PASSWORD` | `changeme-dev-password` | Program Admin password |
| `ENROLLMENT_MODULE_SLUG` | `recognizing-phishing` | Module the loop assigns |

## Notes

- The decoy sign-in and disclosure pages are **server-rendered by the backend**,
  so the browser portion needs only `BACKEND_URL`. The training UI lives in the
  React app; this spec completes training through the tokened `/api/enroll` flow
  (the server-side source of truth). To also exercise the training UI in the
  browser, serve the frontend and navigate to `#/enroll/<completion_token>` — the
  completion token is available from the DB oracle.
- The suite is `fullyParallel: false` / `workers: 1` because it shares one
  campaign across tests and restores it to `active` on the way out.
