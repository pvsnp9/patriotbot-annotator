const { test } = require('node:test');
const assert = require('node:assert');
const { openDb } = require('../src/db');
const { exportCsv } = require('../src/export');

test('exports header and rows with escaping', () => {
  const db = openDb(':memory:');
  db.prepare("INSERT INTO items (id,question,answer,department,persona,intent,url,page_type,source_seed_id) VALUES (1,'Has, comma','a','D','p','yes/no eligibility','u','FAQ',NULL)").run();
  db.prepare("INSERT INTO generations (item_id,model,mode,generated) VALUES (1,'gemma-4-12B-it','sft','the chosen text')").run();
  const aid = db.prepare("INSERT INTO annotators (first_name,last_name,email,consented_at,created_at) VALUES ('Ada','L','a@x','t','t')").run().lastInsertRowid;
  db.prepare("INSERT INTO annotations (item_id,annotator_id,accuracy,source_relevance,valid_link,exact_matching,risk_of_harm,best_model,created_at,updated_at) VALUES (1,?,5,4,1,1,0,'gemma-4-12B-it','t','t')").run(aid);
  const csv = exportCsv(db);
  const lines = csv.trim().split('\n');
  assert.match(lines[0], /^annotation_id,item_id,intent,item_question/);
  assert.match(lines[0], /best_model,best_generated/);
  assert.match(lines[1], /"Has, comma"/);
  assert.match(lines[1], /a@x/);
  assert.match(lines[1], /gemma-4-12B-it/);
  assert.match(lines[1], /the chosen text/);
});

function withTwoAnnotators() {
  const db = openDb(':memory:');
  db.prepare("INSERT INTO items (id,question,answer,department,persona,intent,url,page_type,source_seed_id) VALUES (1,'q','a','D','p','i','u','FAQ',NULL)").run();
  db.prepare("INSERT INTO generations (item_id,model,mode,generated) VALUES (1,'m','sft','g')").run();
  const real = db.prepare("INSERT INTO annotators (first_name,last_name,email,consented_at,created_at) VALUES ('Real','One','real@gmu.edu','t','t')").run().lastInsertRowid;
  const test = db.prepare("INSERT INTO annotators (first_name,last_name,email,consented_at,created_at) VALUES ('Test','Acct','qa@testmail.com','t','t')").run().lastInsertRowid;
  db.prepare("INSERT INTO annotations (item_id,annotator_id,accuracy,source_relevance,best_model,created_at,updated_at) VALUES (1,?,5,5,'m','t','t')").run(real);
  db.prepare("INSERT INTO annotations (item_id,annotator_id,accuracy,source_relevance,best_model,created_at,updated_at) VALUES (1,?,3,3,'m','t','t')").run(test);
  return db;
}

test('exportCsv with no filter returns everyone', () => {
  const db = withTwoAnnotators();
  const lines = exportCsv(db).trim().split('\n');
  assert.equal(lines.length, 3); // header + 2
});

test('excludeTestEmails drops @testmail.com rows', () => {
  const db = withTwoAnnotators();
  const csv = exportCsv(db, { excludeTestEmails: true });
  assert.match(csv, /real@gmu\.edu/);
  assert.doesNotMatch(csv, /qa@testmail\.com/);
  assert.equal(csv.trim().split('\n').length, 2); // header + 1
});

test('email filter returns only that annotator (test accounts allowed)', () => {
  const db = withTwoAnnotators();
  const csv = exportCsv(db, { email: 'qa@testmail.com' });
  assert.match(csv, /qa@testmail\.com/);
  assert.doesNotMatch(csv, /real@gmu\.edu/);
  assert.equal(csv.trim().split('\n').length, 2); // header + 1
});
