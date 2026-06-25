const { test } = require('node:test');
const assert = require('node:assert');
const { openDb } = require('../src/db');
const { getProgress, getModelWins } = require('../src/progress');

test('counts annotations per annotator with pct', () => {
  const db = openDb(':memory:');
  db.prepare("INSERT INTO items (id,question,answer,department,persona,intent,url,page_type,source_seed_id) VALUES (1,'q','a','D','p','i','u','FAQ',NULL),(2,'q','a','D','p','i','u','FAQ',NULL)").run();
  const aid = db.prepare("INSERT INTO annotators (first_name,last_name,email,consented_at,created_at) VALUES ('Ada','L','a@x','t','t')").run().lastInsertRowid;
  db.prepare("INSERT INTO annotations (item_id,annotator_id,accuracy,source_relevance,best_model,created_at,updated_at) VALUES (1,?,5,5,'m-a','t','t'),(2,?,5,5,'m-a','t','t')").run(aid, aid);
  const rows = getProgress(db, 100);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].count, 2);
  assert.equal(rows[0].pct, 2);
  assert.equal(rows[0].email, 'a@x');
});

test('getModelWins tallies best_model, excluding @testmail.com, ordered desc', () => {
  const db = openDb(':memory:');
  db.prepare("INSERT INTO items (id,question,answer,department,persona,intent,url,page_type,source_seed_id) VALUES (1,'q','a','D','p','i','u','FAQ',NULL),(2,'q','a','D','p','i','u','FAQ',NULL),(3,'q','a','D','p','i','u','FAQ',NULL)").run();
  const real = db.prepare("INSERT INTO annotators (first_name,last_name,email,consented_at,created_at) VALUES ('R','x','r@gmu.edu','t','t')").run().lastInsertRowid;
  const test = db.prepare("INSERT INTO annotators (first_name,last_name,email,consented_at,created_at) VALUES ('T','x','qa@testmail.com','t','t')").run().lastInsertRowid;
  const ann = (item, aid, model) => db.prepare("INSERT INTO annotations (item_id,annotator_id,accuracy,source_relevance,best_model,created_at,updated_at) VALUES (?,?,5,5,?,'t','t')").run(item, aid, model);
  ann(1, real, 'gemma'); ann(2, real, 'gemma'); ann(3, real, 'qwen');
  ann(1, test, 'llama'); // test account excluded
  const wins = getModelWins(db);
  assert.deepEqual(wins, [{ model: 'gemma', count: 2 }, { model: 'qwen', count: 1 }]);
});
