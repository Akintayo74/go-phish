'use strict';

// ============================================================================
// In-memory repository layer for Phase 11 whole-system tests.
// ============================================================================
//
// The route/service code reaches the database through the repository singletons
// exported by src/repositories. For an integrated, DB-free system test we
// jest.mock('../src/repositories', () => require('./helpers/memoryRepos').create())
// so the REAL app — real routes, middleware, logger, redirects, services — runs
// end to end against a faithful in-memory store. This lets the full loop
// (send → click → submit → disclose → auto-enroll → complete) be exercised over
// HTTP with supertest, and the credential-leak audit inspect everything the
// integrated system emits, without a Postgres instance.
//
// The store uses the REAL src/lib/hash (so findByIdentifier matches the way
// participants are stored) and the REAL src/lib/token (so tracking/completion
// tokens are genuine opaque values). It implements exactly the repo methods the
// simulation loop calls; it is a test double, not a general ORM.

const { hashIdentifier } = require('../../src/lib/hash');
const { generateToken } = require('../../src/lib/token');

function create() {
  // Backing collections, keyed by id.
  const cohorts = new Map();
  const campaigns = new Map();
  const participants = new Map();
  const interactions = new Map();
  const learningModules = new Map();
  const quizzes = new Map();
  const trainingAssignments = new Map();

  let seq = 0;
  const nextId = (prefix) => `${prefix}-${(seq += 1)}`;

  // ---- Seed helpers (used by tests to set up a scenario) ------------------
  const store = {
    cohorts,
    campaigns,
    participants,
    interactions,
    learningModules,
    quizzes,
    trainingAssignments,

    reset() {
      for (const m of [
        cohorts,
        campaigns,
        participants,
        interactions,
        learningModules,
        quizzes,
        trainingAssignments,
      ]) {
        m.clear();
      }
      seq = 0;
    },

    seedCohort(attrs = {}) {
      const id = attrs.id || nextId('cohort');
      const row = { id, consent_status: 'granted', ...attrs };
      cohorts.set(id, row);
      return row;
    },

    seedCampaign(attrs = {}) {
      const id = attrs.id || nextId('campaign');
      const row = {
        id,
        name: 'Test Campaign',
        status: 'active',
        enrollment_trigger: 'submitted',
        ...attrs,
      };
      campaigns.set(id, row);
      return row;
    },

    // Seeds a participant from a RAW identifier (email/phone). Stores only the
    // keyed hash — never the raw value — exactly like the real repo (guardrail #6).
    seedParticipant({ identifier, cohort_id, role = 'staff', department = 'General', opted_out = false } = {}) {
      const id = nextId('participant');
      const row = {
        id,
        cohort_id,
        role,
        department,
        opted_out,
        email_or_phone_hash: hashIdentifier(identifier),
      };
      participants.set(id, row);
      return row;
    },

    seedModule(attrs = {}) {
      const id = attrs.id || nextId('module');
      const row = {
        id,
        slug: attrs.slug || 'recognizing-phishing',
        title: attrs.title || 'Recognizing Phishing',
        summary: attrs.summary || 'How to spot a phishing attempt.',
        category: attrs.category || 'awareness',
        body_markdown: attrs.body_markdown || '# Lesson',
        published: attrs.published !== false,
        ...attrs,
      };
      learningModules.set(id, row);
      return row;
    },

    seedQuiz({ learning_module_id, questions, pass_threshold = 70 } = {}) {
      const id = nextId('quiz');
      const row = {
        id,
        learning_module_id,
        pass_threshold,
        questions: questions || [
          { prompt: 'Is this phishing?', choices: ['Yes', 'No'], answer_index: 0 },
        ],
      };
      quizzes.set(id, row);
      return row;
    },
  };

  // Shared record-mutation helper mirroring base.update's semantics.
  function apply(map, id, attrs) {
    const row = map.get(id);
    if (!row) return undefined;
    Object.assign(row, attrs);
    return row;
  }

  // ---- Repository singletons (the mocked module surface) ------------------
  const repos = {
    __store: store,

    cohorts: {
      async findById(id) {
        return cohorts.get(id);
      },
    },

    campaigns: {
      async findById(id) {
        return campaigns.get(id);
      },
      async setStatus(id, status) {
        return apply(campaigns, id, { status });
      },
      async list() {
        return [...campaigns.values()];
      },
    },

    participants: {
      async findById(id) {
        return participants.get(id);
      },
      async findByIdentifier(raw) {
        const hash = hashIdentifier(raw);
        for (const row of participants.values()) {
          if (row.email_or_phone_hash === hash) return row;
        }
        return undefined;
      },
    },

    interactions: {
      async findByToken(tracking_token) {
        if (!tracking_token) return undefined;
        for (const row of interactions.values()) {
          if (row.tracking_token === tracking_token) return row;
        }
        return undefined;
      },
      async findByCampaignAndParticipant(campaign_id, participant_id) {
        for (const row of interactions.values()) {
          if (row.campaign_id === campaign_id && row.participant_id === participant_id) return row;
        }
        return undefined;
      },
      async createForTarget({ campaign_id, participant_id }) {
        const id = nextId('interaction');
        const row = {
          id,
          campaign_id,
          participant_id,
          tracking_token: generateToken(),
          opened: false,
          clicked: false,
          submitted: false,
          disclosed: false,
        };
        interactions.set(id, row);
        return row;
      },
      async markOpened(id, at = new Date()) {
        return apply(interactions, id, { opened: true, opened_at: at });
      },
      async markClicked(id, at = new Date()) {
        return apply(interactions, id, { opened: true, clicked: true, clicked_at: at });
      },
      // No value argument — guardrail #1: there is nowhere to put a submitted value.
      async markSubmitted(id, at = new Date()) {
        return apply(interactions, id, { submitted: true, submitted_at: at });
      },
      async markDisclosed(id, at = new Date()) {
        return apply(interactions, id, { disclosed: true, disclosed_at: at });
      },
    },

    learningModules: {
      async findById(id) {
        return learningModules.get(id);
      },
      async findPublishedBySlug(slug) {
        for (const row of learningModules.values()) {
          if (row.slug === slug && row.published === true) return row;
        }
        return undefined;
      },
      async listPublished() {
        return [...learningModules.values()].filter((m) => m.published === true);
      },
    },

    quizzes: {
      async findByModuleId(learning_module_id) {
        for (const row of quizzes.values()) {
          if (row.learning_module_id === learning_module_id) return row;
        }
        return undefined;
      },
    },

    trainingAssignments: {
      async createForEnrollment({ participant_id, learning_module_id, campaign_id, assigned_reason }) {
        const id = nextId('assignment');
        const row = {
          id,
          participant_id,
          learning_module_id,
          campaign_id,
          assigned_reason,
          status: 'assigned',
          assigned_at: new Date(),
          completed_at: null,
          notified_at: null,
          completion_token: generateToken(),
        };
        trainingAssignments.set(id, row);
        return row;
      },
      async findByToken(completion_token) {
        if (!completion_token) return undefined;
        for (const row of trainingAssignments.values()) {
          if (row.completion_token === completion_token) return row;
        }
        return undefined;
      },
      async findExisting({ participant_id, learning_module_id, campaign_id }) {
        for (const row of trainingAssignments.values()) {
          if (
            row.participant_id === participant_id &&
            row.learning_module_id === learning_module_id &&
            row.campaign_id === campaign_id
          ) {
            return row;
          }
        }
        return undefined;
      },
      async listByCampaignAndParticipant(campaign_id, participant_id) {
        return [...trainingAssignments.values()].filter(
          (a) => a.campaign_id === campaign_id && a.participant_id === participant_id
        );
      },
      async markInProgress(id) {
        const row = trainingAssignments.get(id);
        if (!row || row.status !== 'assigned') return undefined;
        row.status = 'in_progress';
        return row;
      },
      async markCompleted(id, at = new Date()) {
        return apply(trainingAssignments, id, { status: 'completed', completed_at: at });
      },
      async markNotified(id, at = new Date()) {
        return apply(trainingAssignments, id, { notified_at: at });
      },
      // Participant-facing projection — omits participant_id and the token itself.
      toPublic(row) {
        if (!row) return row;
        return {
          status: row.status,
          assigned_reason: row.assigned_reason,
          assigned_at: row.assigned_at,
          completed_at: row.completed_at,
          learning_module_id: row.learning_module_id,
          campaign_id: row.campaign_id,
        };
      },
    },
  };

  return repos;
}

module.exports = { create };
