const { test } = require('node:test');
const assert = require('node:assert');
const { openDb } = require('../src/db');
const { saveAnnotation } = require('../src/annotations');

function base() {
  const db = openDb(':memory:');
  db.prepare("INSERT INTO items (id,question,answer,department,persona,intent,url,page_type,source_seed_id) VALUES (1,'q','a','D','p','i','u','FAQ',NULL)").run();
  const aid = db.prepare("INSERT INTO annotators (first_name,last_name,email,consented_at,created_at) VALUES ('f','l','a@x','t','t')").run().lastInsertRowid;
  db.prepare("INSERT INTO claims (item_id,annotator_id,claimed_at) VALUES (1,?,'t')").run(aid);
  return { db, aid };
}

test('inserts annotation with best_model and clears claim', () => {
  const { db, aid } = base();
  saveAnnotation(db, aid, 1, { accuracy: 5, source_relevance: 4, valid_link: null, exact_matching: null, risk_of_harm: null }, 'gemma-4-12B-it', '2026-06-24T00:00:00Z');
  const row = db.prepare('SELECT * FROM annotations WHERE item_id=1 AND annotator_id=?').get(aid);
  assert.equal(row.accuracy, 5);
  assert.equal(row.valid_link, null);
  assert.equal(row.best_model, 'gemma-4-12B-it');
  const claim = db.prepare('SELECT * FROM claims WHERE item_id=1 AND annotator_id=?').get(aid);
  assert.equal(claim, undefined);
});

test('re-saving updates the same row (upsert), including best_model', () => {
  const { db, aid } = base();
  const t = '2026-06-24T00:00:00Z';
  saveAnnotation(db, aid, 1, { accuracy: 2, source_relevance: 2, valid_link: null, exact_matching: null, risk_of_harm: null }, 'm-a', t);
  saveAnnotation(db, aid, 1, { accuracy: 4, source_relevance: 4, valid_link: null, exact_matching: null, risk_of_harm: null }, 'm-b', '2026-06-24T01:00:00Z');
  const rows = db.prepare('SELECT * FROM annotations WHERE item_id=1 AND annotator_id=?').all(aid);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].accuracy, 4);
  assert.equal(rows[0].best_model, 'm-b');
  assert.equal(rows[0].created_at, t, 'created_at preserved');
});
