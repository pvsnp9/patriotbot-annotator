const { test } = require('node:test');
const assert = require('node:assert');
const { openDb } = require('../src/db');

test('openDb creates all tables and enables WAL', () => {
  const db = openDb(':memory:');
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
    .all()
    .map((r) => r.name);
  for (const t of ['annotations', 'annotators', 'claims', 'generations', 'items', 'presentations', 'seeds']) {
    assert.ok(tables.includes(t), `missing table ${t}`);
  }
  // best_model column exists on annotations
  const cols = db.prepare('PRAGMA table_info(annotations)').all().map((c) => c.name);
  assert.ok(cols.includes('best_model'), 'annotations.best_model missing');
  // unique(email) enforced
  db.prepare("INSERT INTO annotators (first_name,last_name,email,consented_at,created_at) VALUES ('a','b','x@y.z','t','t')").run();
  assert.throws(() =>
    db.prepare("INSERT INTO annotators (first_name,last_name,email,consented_at,created_at) VALUES ('c','d','x@y.z','t','t')").run()
  );
});
