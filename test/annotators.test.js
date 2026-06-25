const { test } = require('node:test');
const assert = require('node:assert');
const { openDb } = require('../src/db');
const { upsertAnnotator } = require('../src/annotators');

test('creates annotator and is idempotent by email', () => {
  const db = openDb(':memory:');
  const id1 = upsertAnnotator(db, { first_name: 'Ada', last_name: 'L', email: 'Ada@x.Z ' }, '2026-06-24T00:00:00Z');
  const id2 = upsertAnnotator(db, { first_name: 'Ada', last_name: 'L', email: 'ada@x.z' }, '2026-06-25T00:00:00Z');
  assert.equal(id1, id2);
  const row = db.prepare('SELECT * FROM annotators WHERE id = ?').get(id1);
  assert.equal(row.email, 'ada@x.z');
  assert.equal(row.consented_at, '2026-06-24T00:00:00Z');
});

test('throws on missing fields', () => {
  const db = openDb(':memory:');
  assert.throws(() => upsertAnnotator(db, { first_name: '', last_name: 'L', email: 'a@b.c' }, 't'));
});
