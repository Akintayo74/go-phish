'use strict';

// ============================================================================
// PHASE 5 — Interaction tracking (tracked link + optional open pixel).
// ============================================================================
//
// These routes are PARTICIPANT-FACING and UNAUTHENTICATED — reached by
// following the tracked link in a simulation email, keyed by the opaque
// `:token` minted at send time (services/delivery.js). They record behavioral
// flags ONLY; there is no form, no body, and nothing here that could capture a
// typed value.
//
//   GET /t/:token            → mark `clicked` (implies opened), redirect to the
//                              Phase 4 decoy page (/sim/:token)
//   GET /t/:token/pixel.gif  → mark `opened`, return a 1x1 transparent GIF
//
// PRIVACY: neither route reveals whether the token is known. An unknown token
// still redirects to the landing page (which renders statelessly) and still
// returns the pixel — so an outsider probing tokens learns nothing, and the
// global logger records only method/path/status (never the body/query).

const express = require('express');
const { interactions } = require('../repositories');
const { asyncHandler } = require('../lib/http');

const router = express.Router();

const SIM_MOUNT = '/sim';

// 1x1 transparent GIF.
const PIXEL = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64'
);

async function findInteraction(token) {
  if (!token) return null;
  return interactions.findByToken(token);
}

// Tracked link. Records the click (which implies the email was opened) and
// hands the participant to the Phase 4 decoy page. The redirect happens for any
// token, known or not, so validity never leaks.
router.get(
  '/:token',
  asyncHandler(async (req, res) => {
    const interaction = await findInteraction(req.params.token);
    if (interaction && !interaction.clicked) {
      await interactions.markClicked(interaction.id);
    }
    res.redirect(302, `${SIM_MOUNT}/${encodeURIComponent(req.params.token)}`);
  })
);

// Open-tracking pixel. Records the open and always returns the GIF with
// no-store headers so a re-fetch reflects a real re-open rather than a cache.
router.get(
  '/:token/pixel.gif',
  asyncHandler(async (req, res) => {
    const interaction = await findInteraction(req.params.token);
    if (interaction && !interaction.opened) {
      await interactions.markOpened(interaction.id);
    }
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.set('Pragma', 'no-cache');
    res.type('gif').status(200).send(PIXEL);
  })
);

module.exports = router;
