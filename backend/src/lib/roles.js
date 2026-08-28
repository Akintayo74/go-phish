'use strict';

// Admin roles (Phase 3). Two roles per the PRD/plan:
//  - program_admin: manages campaigns, cohorts, participants, and other admins.
//  - researcher:    read/evaluate access (analytics in later phases); may view
//                   campaigns but not create/edit/pause them.
// Kept in one place so route guards and the DB check constraint stay in sync.

const ROLES = Object.freeze({
  PROGRAM_ADMIN: 'program_admin',
  RESEARCHER: 'researcher',
});

const ALL_ROLES = Object.freeze([ROLES.PROGRAM_ADMIN, ROLES.RESEARCHER]);

function isValidRole(role) {
  return ALL_ROLES.includes(role);
}

module.exports = { ROLES, ALL_ROLES, isValidRole };
