'use strict';

// Boot-time database bootstrap.
//
// Render's free tier supports neither a pre-deploy command nor shell access, so
// migrations cannot run as a separate deploy step and seeds cannot be run by
// hand. This runs from the start command, before the server binds a port. On a
// paid plan it can move to `preDeployCommand` unchanged.
//
// MIGRATIONS run on every boot. `migrate.latest()` is a no-op with nothing
// pending, and knex takes a migration lock, so two instances starting at once
// cannot apply the same batch twice.
//
// SEEDING is guarded, because the seeds are DESTRUCTIVE: 01_demo_data.js clears
// cohorts, participants, interactions and campaigns before inserting. A free
// instance restarts every time it wakes from idle, so an unguarded seed would
// erase collected behavioural data on every cold start — the research record
// the platform exists to produce.
//
//   SEED_ON_BOOT unset | 'auto'   seed only when the database has never been
//                                 seeded (no learning modules) — i.e. first boot
//   SEED_ON_BOOT=never            migrate only, never seed
//   SEED_ON_BOOT=force            reseed unconditionally (DESTRUCTIVE reset)

const { db } = require('../src/db');

// Sentinel for "this database has been fully seeded".
//
// It probes BOTH tables the seeds own, not just one, because seeds run as
// separate files and a run can fail part way: an early version of this script
// checked learning modules alone, so a seed that created modules and then threw
// on the admin accounts left a database that looked seeded and had NO operator
// to log in as. Both probes are content rather than collected data, and the
// seeds are idempotent (each clears its own tables first), so re-running after
// a partial failure is safe and is the behaviour we want.
async function hasBeenSeeded() {
  const [modules, admins] = await Promise.all([
    db('learning_modules').count({ n: '*' }).first(),
    db('admin_users').count({ n: '*' }).first(),
  ]);
  return Number(modules.n) > 0 && Number(admins.n) > 0;
}

// Fail BEFORE touching the database rather than part way through it. Seeding is
// multi-file and not transactional across files, so a config error caught
// mid-run is what produces the half-seeded state described above.
function preflight() {
  if (process.env.NODE_ENV === 'production' && !process.env.SEED_ADMIN_PASSWORD) {
    throw new Error(
      'SEED_ADMIN_PASSWORD is required to seed in production (pre-launch ' +
        'checklist §6). Set it and redeploy, or set SEED_ON_BOOT=never to ' +
        'start without seeding.'
    );
  }
}

async function bootstrap() {
  const mode = (process.env.SEED_ON_BOOT || 'auto').toLowerCase();

  const [batch, applied] = await db.migrate.latest();
  console.log(
    applied.length
      ? `[bootstrap] applied ${applied.length} migration(s) as batch ${batch}`
      : '[bootstrap] schema up to date'
  );

  if (mode === 'never') {
    console.log('[bootstrap] seeding disabled (SEED_ON_BOOT=never)');
    return;
  }

  if (mode === 'force') {
    preflight();
    await db.seed.run();
    console.log('[bootstrap] seeds re-run (SEED_ON_BOOT=force)');
    return;
  }

  if (await hasBeenSeeded()) {
    console.log('[bootstrap] already seeded, leaving data alone');
    return;
  }

  preflight();
  await db.seed.run();
  console.log('[bootstrap] seeded a fresh database');
}

bootstrap()
  .then(() => db.destroy())
  .catch(async (err) => {
    // Fail closed: a server whose schema is behind its code should not take
    // traffic. Message only — never the connection string or a stack that
    // might carry one (guardrail #2).
    console.error(`[bootstrap] FAILED: ${err.message}`);
    await db.destroy().catch(() => {});
    process.exit(1);
  });
