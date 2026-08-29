'use strict';

// Small repository factory shared by the entity repositories. Each repository
// wraps a single table with the common query operations used across the app.
// Keeping data access here (rather than sprinkling knex calls through route
// handlers) makes the guardrail invariants easy to audit in one place.

const { db } = require('../db');

function createRepository(table, { conn = db } = {}) {
  return {
    table,

    query(trx) {
      return (trx || conn)(table);
    },

    async list({ limit = 100, offset = 0, orderBy = 'created_at' } = {}, trx) {
      return (trx || conn)(table)
        .select('*')
        .orderBy(orderBy)
        .limit(limit)
        .offset(offset);
    },

    async findById(id, trx) {
      return (trx || conn)(table).where({ id }).first();
    },

    async findWhere(criteria, trx) {
      return (trx || conn)(table).where(criteria).first();
    },

    async create(attrs, trx) {
      const [row] = await (trx || conn)(table).insert(attrs).returning('*');
      return row;
    },

    async update(id, attrs, trx) {
      const [row] = await (trx || conn)(table)
        .where({ id })
        .update({ ...attrs, updated_at: (trx || conn).fn.now() })
        .returning('*');
      return row;
    },

    async remove(id, trx) {
      return (trx || conn)(table).where({ id }).del();
    },

    async count(criteria = {}, trx) {
      const row = await (trx || conn)(table).where(criteria).count('* as c').first();
      return Number(row.c);
    },
  };
}

module.exports = { createRepository };
