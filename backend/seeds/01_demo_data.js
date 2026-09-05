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

  // --- Campaigns ----------------------------------------------------------
  // Phase I is the baseline measurement. Phase II is a re-test cloned from it
  // (Phase 10): same definition, its own clean slate, linked back via
  // `cloned_from_campaign_id` so the two line up in the side-by-side comparison
  // view. It is left in 'draft' — a re-test is scheduled and sent fresh.
  const [phaseI] = await knex('campaigns')
    .insert({
      name: 'Baseline Susceptibility — Phase I',
      description: 'Initial measurement against the consented Lagos cohort.',
      status: 'draft',
      phase_label: 'Phase I',
      enrollment_trigger: 'submitted',
    })
    .returning('*');

  await knex('campaigns').insert({
    name: 'Baseline Susceptibility — Phase II (re-test)',
    description: 'Re-test of the Lagos cohort after the first training cycle.',
    status: 'draft',
    phase_label: 'Phase II',
    enrollment_trigger: 'submitted',
    cloned_from_campaign_id: phaseI.id,
  });

  // --- Learning modules (the CAT resource library) + a quiz ---------------
  // Content covers the Phase 6 curriculum: what phishing/social engineering is,
  // how to recognize an attempt, the tactics common in the Nigerian financial
  // sector (SIM swap, smishing, vishing, impersonation), and what to do after
  // clicking. Grouped by `category` for the resource library. A draft module is
  // included so the "published-only" public API is exercised by real data.
  const modules = await knex('learning_modules')
    .insert([
      {
        slug: 'what-is-phishing',
        title: 'What Phishing and Social Engineering Are',
        summary:
          'The basics: how attackers manipulate people instead of hacking machines.',
        body_markdown: [
          '# What Phishing and Social Engineering Are',
          '',
          '**Social engineering** is manipulating a person into doing something',
          'unsafe — clicking a link, revealing a code, approving a transfer —',
          'instead of attacking a computer directly. **Phishing** is social',
          'engineering delivered by message: email, SMS, a chat, or a phone call.',
          '',
          'The attacker\'s goal is almost always one of three things:',
          '',
          '- **Credentials** — your username and password, or a one-time code.',
          '- **Money** — a fraudulent transfer or payment you approve.',
          '- **Access** — getting malware onto a device, or a foothold in a system.',
          '',
          'It works because it targets *people*, not software. A message that',
          'creates fear or urgency ("your account will be suspended") pushes you to',
          'act before you think. The rest of this library shows you how to slow',
          'down and check.',
          '',
          '> Remember: a real bank or employer never needs your password, PIN, or',
          '> OTP. Anyone who asks for them — by any channel — is an attacker.',
          '',
          '## Go further',
          '',
          '- [Avoiding social engineering and phishing attacks](https://www.cisa.gov/news-events/news/avoiding-social-engineering-and-phishing-attacks)',
          '  — CISA, the US cyber-defence agency.',
          '- [Introduction to Cybersecurity](https://www.netacad.com/courses/introduction-to-cybersecurity)',
          '  — Cisco Networking Academy, a free self-paced course (about 6 hours).',
        ].join('\n'),
        category: 'fundamentals',
        order_index: 1,
        published: true,
      },
      {
        slug: 'recognizing-phishing',
        title: 'How to Recognize a Phishing Attempt',
        summary: 'The tell-tale signs of a phishing email or message.',
        body_markdown: [
          '# How to Recognize a Phishing Attempt',
          '',
          'Most phishing messages share a handful of signs. Spotting even one is a',
          'reason to stop and verify.',
          '',
          '## Common signs',
          '',
          '- **Urgency or threat** — "act now or your account is locked."',
          '- **A mismatched sender** — the display name looks right but the address',
          '  domain is subtly wrong (`support@micros0ft-verify.com`).',
          '- **A link that hides its destination** — hover (or long-press on mobile)',
          '  to see where it really goes before you tap.',
          '- **Unexpected attachments** — especially documents that ask you to',
          '  "enable content" or a login page reached from an attachment.',
          '- **A request for secrets** — password, PIN, OTP, card number.',
          '- **Generic greetings and small errors** — "Dear Customer", odd grammar.',
          '',
          '## What to do instead',
          '',
          '1. Do not click. Navigate to the official site or app yourself.',
          '2. Verify the request through a channel you already trust.',
          '3. Report the message to your security team.',
          '',
          'When in doubt, treat the message as hostile until you have confirmed it',
          'through a second, trusted route.',
          '',
          '## Go further',
          '',
          '- [Take Google\'s phishing quiz](https://phishingquiz.withgoogle.com/) — eight',
          '  real-world messages; can you call each one?',
          '- [Phishing attacks: how to defend yourself](https://www.ncsc.gov.uk/collection/phishing-scams)',
          '  — the UK National Cyber Security Centre.',
          '- [How to recognise and avoid phishing scams](https://consumer.ftc.gov/articles/how-recognize-and-avoid-phishing-scams)',
          '  — US Federal Trade Commission.',
        ].join('\n'),
        category: 'phishing',
        order_index: 1,
        published: true,
      },
      {
        slug: 'nigerian-context-tactics',
        title: 'Local Tactics: SIM Swap, Smishing, Vishing, Impersonation',
        summary:
          'Social-engineering tactics common in the Nigerian financial sector.',
        body_markdown: [
          '# Local Tactics in the Nigerian Financial Sector',
          '',
          'Attackers tailor their approach to local channels and trust. These are',
          'the ones seen most often.',
          '',
          '## SIM swap',
          '',
          'A fraudster convinces (or bribes) a mobile operator to move your phone',
          'number to their SIM. Your OTPs then arrive on **their** phone. Warning',
          'sign: your line suddenly loses service for no reason. Contact your',
          'operator immediately if that happens.',
          '',
          '## Smishing (SMS phishing)',
          '',
          'A text claiming to be your bank or a delivery service, with a link to a',
          'fake login page. Banks do not send you links asking you to "reactivate"',
          'or "verify" your account by SMS.',
          '',
          '## Vishing (voice phishing)',
          '',
          'A call from someone posing as bank staff, a regulator (e.g. the CBN or',
          'EFCC), or IT support, pressuring you to read out an OTP or approve a',
          'transaction. Hang up and call the institution back on its official',
          'number.',
          '',
          '## Impersonation',
          '',
          'A message or call pretending to be a senior colleague or vendor asking',
          'for an urgent transfer or a change of account details. Verify any',
          'payment-detail change in person or by a known phone number — never using',
          'the contact details in the request itself.',
          '',
          '> A bank, telco, or regulator will **never** ask for your PIN, password,',
          '> or OTP — not by call, SMS, email, or in person.',
          '',
          '## Go further',
          '',
          '- [Nigerian Communications Commission](https://www.ncc.gov.ng/) — consumer',
          '  guidance and complaints about your line, including SIM-related fraud.',
          '- [Central Bank of Nigeria](https://www.cbn.gov.ng/) — consumer protection',
          '  and the official channel for a complaint against a bank.',
          '- [Nigeria Data Protection Commission](https://ndpc.gov.ng/) — your rights',
          '  over your personal data, and how to complain when they are breached.',
        ].join('\n'),
        category: 'local-tactics',
        order_index: 1,
        published: true,
      },
      {
        slug: 'what-to-do-if-you-clicked',
        title: 'What To Do If You Clicked',
        summary: 'Immediate steps after interacting with a phishing attempt.',
        body_markdown: [
          '# What To Do If You Clicked',
          '',
          'Clicking a phishing link or entering something on a fake page happens to',
          'careful people. What matters is acting quickly and without shame — there',
          'is no punishment for reporting.',
          '',
          '## Do this now',
          '',
          '1. **Stop.** Do not enter anything more. Close the page.',
          '2. **Disconnect** the device from the network if you downloaded or ran',
          '   anything.',
          '3. **Report** to your security team right away — speed limits the damage.',
          '4. **Change the affected password** from a *different*, trusted device,',
          '   and turn on multi-factor authentication if it is not already on.',
          '5. If any bank or card detail was involved, **call your bank** on its',
          '   official number and ask them to watch or freeze the account.',
          '',
          '## Do not',
          '',
          '- Do not hide it or wait to see what happens.',
          '- Do not reuse the compromised password anywhere else.',
          '',
          'Reporting early is the single most useful thing you can do.',
          '',
          '## Go further',
          '',
          '- [Report a phishing message](https://apwg.org/reportphishing/) — the',
          '  Anti-Phishing Working Group, which feeds browser and mail blocklists.',
          '- [Suspicious email: what to do next](https://www.ncsc.gov.uk/guidance/suspicious-email-actions)',
          '  — a step-by-step from the UK NCSC.',
        ].join('\n'),
        category: 'incident-response',
        order_index: 1,
        published: true,
      },
      {
        slug: 'protecting-your-accounts',
        title: 'Protecting Your Accounts',
        summary: 'Everyday habits that make you a much harder target.',
        body_markdown: [
          '# Protecting Your Accounts',
          '',
          'A few habits sharply reduce your risk:',
          '',
          '- **Use multi-factor authentication (MFA)** everywhere it is offered.',
          '- **Use a unique password per account** — a password manager makes this',
          '  painless. A leak of one site then cannot open the others.',
          '- **Keep your phone number secure** and set a SIM PIN with your operator.',
          '- **Update your devices and apps** so known flaws are patched.',
          '- **Slow down on anything urgent** — urgency is the attacker\'s main tool.',
          '',
          'None of these are hard. Together they turn you from an easy target into',
          'a hard one.',
          '',
          '## Go further',
          '',
          '- [Secure Our World](https://www.cisa.gov/secure-our-world) — CISA\'s four',
          '  everyday habits, explained in plain language.',
          '- [Phishing resources](https://staysafeonline.org/resources/phishing/) — the',
          '  National Cybersecurity Alliance.',
        ].join('\n'),
        category: 'fundamentals',
        order_index: 2,
        published: true,
      },
      {
        slug: 'where-to-learn-more',
        title: 'Where to Learn More',
        summary:
          'Free courses, quizzes and official guidance from outside this site.',
        body_markdown: [
          '# Where to Learn More',
          '',
          'These five lessons are a starting point, not a full curriculum. Everything',
          'below is free, needs no account here, and is maintained by people who do',
          'this full time. Links open in a new tab.',
          '',
          '## Test yourself',
          '',
          '- [Google\'s phishing quiz](https://phishingquiz.withgoogle.com/) — eight',
          '  real messages to judge. Ten minutes, and most people miss at least one.',
          '',
          '## Free courses',
          '',
          '- [Cisco Networking Academy — Introduction to Cybersecurity](https://www.netacad.com/courses/introduction-to-cybersecurity)',
          '  — about 6 hours, self-paced, with a certificate at the end.',
          '- [Cisco Learning Network](https://learningnetwork.cisco.com/) — deeper',
          '  material if you want to move toward security as a career.',
          '',
          '## Official guidance',
          '',
          '- [UK NCSC — phishing attacks](https://www.ncsc.gov.uk/collection/phishing-scams)',
          '  — the clearest plain-English explanation of how the attacks work.',
          '- [CISA — Secure Our World](https://www.cisa.gov/secure-our-world) — four',
          '  habits (MFA, strong passwords, updates, spotting phishing).',
          '- [US FTC — recognise and avoid phishing scams](https://consumer.ftc.gov/articles/how-recognize-and-avoid-phishing-scams)',
          '  — written for consumers rather than IT staff.',
          '- [National Cybersecurity Alliance — phishing resources](https://staysafeonline.org/resources/phishing/)',
          '',
          '## Reporting and local bodies',
          '',
          '- [Anti-Phishing Working Group](https://apwg.org/reportphishing/) — where to',
          '  forward a phishing message so it reaches browser and mail blocklists.',
          '- [Nigerian Communications Commission](https://www.ncc.gov.ng/) — line and',
          '  SIM-related fraud.',
          '- [Central Bank of Nigeria](https://www.cbn.gov.ng/) — complaints about a',
          '  bank or a fraudulent transaction.',
          '- [Nigeria Data Protection Commission](https://ndpc.gov.ng/) — your rights',
          '  over your personal data.',
          '',
          '> Report the incident to your own security team **first**. The links above',
          '> help afterwards; they do not replace telling the people who can act now.',
        ].join('\n'),
        category: 'resources',
        order_index: 1,
        published: true,
      },
      {
        // Intentionally unpublished — proves the public API hides drafts.
        slug: 'draft-advanced-threats',
        title: 'Advanced Threats (Draft)',
        summary: 'Work-in-progress module, not yet published.',
        body_markdown:
          '# Advanced Threats\n\nThis module is still being written and should not be visible on the public site yet.',
        category: 'fundamentals',
        order_index: 99,
        published: false,
      },
    ])
    .returning('*');

  // Per-module knowledge checks (Phase 7). Each quiz's `answer_index` is the
  // private key used for server-side scoring — the public API strips it before
  // the questions ever reach a browser.
  const bySlug = (slug) => modules.find((m) => m.slug === slug);

  await knex('quizzes').insert([
    {
      learning_module_id: bySlug('recognizing-phishing').id,
      title: 'Phishing Recognition — Knowledge Check',
      pass_threshold: 70,
      questions: JSON.stringify([
        {
          prompt:
            'A message urges you to "verify your account now" via a link. What is the safest action?',
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
    },
    {
      learning_module_id: bySlug('what-to-do-if-you-clicked').id,
      title: 'If You Clicked — Knowledge Check',
      pass_threshold: 70,
      questions: JSON.stringify([
        {
          prompt:
            'You entered your password on a page you now suspect was fake. What should you do first?',
          choices: [
            'Wait and see if anything happens',
            'Change that password immediately (from a device you trust)',
            'Delete the email so no one finds out',
            'Reply to the message asking if it was real',
          ],
          answer_index: 1,
        },
        {
          prompt: 'Why report a suspected phishing click to your security team quickly?',
          choices: [
            'So you can be blamed',
            'It is required to keep your job',
            'Fast reporting lets them contain damage and warn others',
            'There is no reason to report it',
          ],
          answer_index: 2,
        },
        {
          prompt: 'Reusing that same password elsewhere means…',
          choices: [
            'Nothing — each site is separate',
            'Only that one site is at risk',
            'Every account sharing it is now at risk and should be changed',
            'It becomes stronger over time',
          ],
          answer_index: 2,
        },
      ]),
    },
  ]);
};
