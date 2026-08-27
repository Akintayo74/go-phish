'use strict';

// Demo seed data for local development. Safe by construction: no raw contact
// identifiers (participants are stored as keyed hashes) and no interaction
// carries any submitted value. Idempotent: clears the tables it owns, in FK
// order, then re-inserts.

const { hashIdentifier } = require('../src/lib/hash');

/** @param {import('knex').Knex} knex */
exports.seed = async function seed(knex) {
  // Delete in reverse dependency order.
  await knex('training_assignments').del();
  await knex('interactions').del();
  await knex('quizzes').del();
  await knex('learning_modules').del();
  await knex('participants').del();
  await knex('campaigns').del();
  await knex('cohorts').del();

  // --- Cohorts (consent unit) ---------------------------------------------
  const [consented, pending] = await knex('cohorts')
    .insert([
      {
        name: 'Retail Banking — Lagos',
        description: 'Front-office retail staff, Lagos branches.',
        consent_status: 'granted',
        consent_granted_at: knex.fn.now(),
      },
      {
        name: 'Operations — Abuja',
        description: 'Back-office operations; consent not yet granted.',
        consent_status: 'pending',
      },
    ])
    .returning('*');

  // --- Participants (hashed identifiers only) -----------------------------
  await knex('participants').insert([
    {
      cohort_id: consented.id,
      email_or_phone_hash: hashIdentifier('adaeze.okafor@example-bank.test'),
      role: 'Teller',
      department: 'Retail Banking',
    },
    {
      cohort_id: consented.id,
      email_or_phone_hash: hashIdentifier('bilal.mohammed@example-bank.test'),
      role: 'Relationship Officer',
      department: 'Retail Banking',
    },
    {
      cohort_id: pending.id,
      email_or_phone_hash: hashIdentifier('chidi.eze@example-bank.test'),
      role: 'Operations Analyst',
      department: 'Operations',
    },
  ]);

  // --- Campaign -----------------------------------------------------------
  await knex('campaigns').insert({
    name: 'Baseline Susceptibility — Phase I',
    description: 'Initial measurement against the consented Lagos cohort.',
    status: 'draft',
    phase_label: 'Phase I',
    enrollment_trigger: 'submitted',
  });

  // --- Learning modules + a quiz ------------------------------------------
  const [phishingModule] = await knex('learning_modules')
    .insert([
      {
        slug: 'recognizing-phishing',
        title: 'Recognizing a Phishing Attempt',
        summary: 'The tell-tale signs of a phishing email or message.',
        body_markdown:
          '# Recognizing a Phishing Attempt\n\nPhishing messages create urgency, spoof a trusted sender, and push you toward a link or attachment. Check the sender address, hover before you click, and never enter credentials from an emailed link.',
        category: 'phishing',
        order_index: 1,
        published: true,
      },
      {
        slug: 'nigerian-context-tactics',
        title: 'Local Tactics: SIM Swap, Smishing, Vishing',
        summary: 'Social-engineering tactics common in the Nigerian context.',
        body_markdown:
          '# Local Tactics\n\nAttackers use SIM-swap fraud, SMS phishing (smishing), and voice phishing (vishing) impersonating bank staff or regulators. Verify through official channels; a bank will never ask for your PIN or OTP.',
        category: 'smishing',
        order_index: 2,
        published: true,
      },
      {
        slug: 'what-to-do-if-you-clicked',
        title: 'What To Do If You Clicked',
        summary: 'Immediate steps after interacting with a phishing attempt.',
        body_markdown:
          '# What To Do If You Clicked\n\nDo not panic. Do not enter any further information. Report to your security team immediately and change affected passwords from a trusted device.',
        category: 'what-to-do-if-you-clicked',
        order_index: 3,
        published: true,
      },
    ])
    .returning('*');

  await knex('quizzes').insert({
    learning_module_id: phishingModule.id,
    title: 'Phishing Recognition — Knowledge Check',
    pass_threshold: 70,
    questions: JSON.stringify([
      {
        prompt: 'A message urges you to "verify your account now" via a link. What is the safest action?',
        choices: [
          'Click the link and log in quickly',
          'Reply with your credentials',
          'Navigate to the official site yourself and check',
          'Forward it to a colleague to click',
        ],
        answer_index: 2,
      },
      {
        prompt: 'Your bank will legitimately ask you for which of these by SMS?',
        choices: ['Your OTP', 'Your PIN', 'Your password', 'None of these'],
        answer_index: 3,
      },
    ]),
  });
};
