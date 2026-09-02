'use strict';

// ============================================================================
// PHASE 4 — Simulated landing page + dummy form + disclosure.
// GUARDRAIL-CRITICAL, highest-sensitivity component. Built for independent
// (non-author) review — read src/views/simPages.js alongside this file.
// ============================================================================
//
// These routes are PARTICIPANT-FACING and deliberately UNAUTHENTICATED — a
// simulation target reaches them by following a tracked link, not by logging
// into the admin console. They are keyed by an opaque `:token` which maps to a
// single `interactions` row (the token is minted in Phase 5; Phase 4 records
// against it when present).
//
// The three routes:
//   GET  /sim/:token             → render the fictional sign-in page (no writes)
//   POST /sim/:token             → DISCARD the posted form values, record only
//                                  `submitted = true`, redirect to disclosure
//   GET  /sim/:token/disclosure  → record `disclosed = true`, render disclosure
//
// GUARDRAIL #1 (no real credentials, ever): the POST handler NEVER reads
// `req.body`. There is no code path here that copies, stores, logs, or returns a
// submitted field value. `interactions.markSubmitted` takes no value argument by
// design (see repositories/interactions.js and the schema), so there is nowhere
// to put one even if someone tried. The named test
// `tests/sim.form.guardrail.test.js` pins this and fails the build if it drifts.
//
// GUARDRAIL #2 (bodies never logged): the global request logger records only
// safe metadata and never reads bodies/query/headers (see requestLogger.js);
// this route adds nothing that would log a value.
//
// GUARDRAIL #4 (transparency): EVERY submission redirects to the disclosure
// page, and the disclosure is reachable even for an unknown token, so a
// participant always learns it was a simulation.

const express = require('express');
const config = require('../config');
const { interactions } = require('../repositories');
const { asyncHandler } = require('../lib/http');
const { renderLandingPage, renderDisclosurePage } = require('../views/simPages');
const { safeEnrollFromInteraction } = require('../services/enrollment');
const { isRecordingHalted } = require('../services/campaignState');

const router = express.Router();

const MOUNT = '/sim';

function disclosurePath(token) {
  return `${MOUNT}/${encodeURIComponent(token)}/disclosure`;
}

function actionPath(token) {
  return `${MOUNT}/${encodeURIComponent(token)}`;
}

// Best-effort interaction lookup. A missing/unknown token is NOT an error: the
// page still renders and the disclosure still shows (transparency), we simply
// have no row to flag. Never let a lookup failure surface a value to the client.
async function findInteraction(token) {
  if (!token) return null;
  return interactions.findByToken(token);
}

// GET landing — render the decoy sign-in page. Pure render, no state change
// (marking `clicked` belongs to the Phase 5 tracked-link redirect that sends the
// participant here).
router.get(
  '/:token',
  asyncHandler(async (req, res) => {
    const html = renderLandingPage({
      brandName: config.simBrandName,
      actionPath: actionPath(req.params.token),
    });
    res.status(200).type('html').send(html);
  })
);

// POST dummy form — the sensitive path.
//
// We intentionally do not touch `req.body`. We look the interaction up by token
// and, if it exists and has not already been marked, record ONLY that a form was
// submitted (no values). Then we always redirect to the disclosure page.
router.post(
  '/:token',
  asyncHandler(async (req, res) => {
    const interaction = await findInteraction(req.params.token);
    // Phase 11 — pause/rollback: a paused (non-active) campaign records no new
    // flags and enrolls no one. The posted values are discarded regardless
    // (guardrail #1), and the redirect to disclosure below is UNCHANGED so the
    // participant always reaches the transparency page (guardrail #4).
    if (interaction && !(await isRecordingHalted(interaction))) {
      const updated = interaction.submitted
        ? interaction
        : // No value argument — there is nothing to persist beyond the boolean.
          (await interactions.markSubmitted(interaction.id)) || interaction;
      // Phase 8 — auto-enroll into training. A submit always meets the trigger
      // (whether the campaign enrolls on click or submit). Best-effort: never
      // let enrollment break the redirect to disclosure (guardrail #4).
      await safeEnrollFromInteraction(updated);
    }
    // 303 → force a GET on the disclosure page after the POST (and never echo
    // the submitted body back to the client).
    res.redirect(303, disclosurePath(req.params.token));
  })
);

// GET disclosure — transparency. Records that disclosure was reached, then
// renders it. Shown even when the token is unknown.
router.get(
  '/:token/disclosure',
  asyncHandler(async (req, res) => {
    const interaction = await findInteraction(req.params.token);
    // The disclosure page ALWAYS renders (guardrail #4), even for an unknown
    // token or a paused campaign. Recording that disclosure was reached is a new
    // write, so it obeys the pause/rollback gate like the other flags.
    if (interaction && !interaction.disclosed && !(await isRecordingHalted(interaction))) {
      await interactions.markDisclosed(interaction.id);
    }
    const html = renderDisclosurePage({
      brandName: config.simBrandName,
      trainingUrl: config.simTrainingUrl,
    });
    res.status(200).type('html').send(html);
  })
);

module.exports = router;
