const { test } = require('node:test');
const assert = require('node:assert');
const { openDb } = require('../src/db');
const { getNextItem, getPresentedModels } = require('../src/pool');

const idShuffle = (arr) => arr; // deterministic order for tests

function setup() {
  const db = openDb(':memory:');
  db.prepare("INSERT INTO seeds (id,question,answer,department,url,page_type) VALUES (1,'sq','sa','D','http://s','FAQ')").run();
  const insItem = db.prepare("INSERT INTO items (id,question,answer,department,persona,intent,url,page_type,source_seed_id) VALUES (?,?,?,?,?,?,?,?,1)");
  const insGen = db.prepare("INSERT INTO generations (item_id,model,mode,generated) VALUES (?,?,?,?)");
  for (let i = 1; i <= 3; i++) {
    insItem.run(i, 'q' + i, 'a', 'D', 'p', 'comparison of options', 'http://u', 'FAQ');
    insGen.run(i, 'm-a', 'sft', 'gen A for ' + i);
    insGen.run(i, 'm-b', 'sft', 'gen B for ' + i);
    insGen.run(i, 'm-c', 'sft', 'gen C for ' + i);
  }
  const a = (em) => db.prepare("INSERT INTO annotators (first_name,last_name,email,consented_at,created_at) VALUES ('f','l',?,'t','t')").run(em).lastInsertRowid;
  return { db, A: a('a@x'), B: a('b@x'), C: a('c@x') };
}
const ann = (db, itemId, aid) =>
  db.prepare("INSERT INTO annotations (item_id,annotator_id,accuracy,source_relevance,best_model,created_at,updated_at) VALUES (?,?,5,5,'m-a','t','t')").run(itemId, aid);

test('serves item with seed and blind shuffled options; claims it', () => {
  const { db, A } = setup();
  const r = getNextItem(db, A, { shuffle: idShuffle });
  assert.equal(r.status, 'item');
  assert.ok(r.item.seed && r.item.seed.id === 1);
  assert.equal(r.item.options.length, 3);
  assert.deepEqual(r.item.options.map((o) => o.idx), [0, 1, 2]);
  assert.ok(!('model' in r.item.options[0]), 'options must not leak model');
  assert.ok(typeof r.item.options[0].text === 'string');
  // identity shuffle => models in sorted order, persisted
  assert.deepEqual(getPresentedModels(db, A, r.item.id), ['m-a', 'm-b', 'm-c']);
  assert.ok(db.prepare('SELECT * FROM claims WHERE annotator_id = ?').get(A));
});

test('resume returns same item and same option order', () => {
  const { db, A } = setup();
  const first = getNextItem(db, A, { shuffle: idShuffle });
  const again = getNextItem(db, A, { shuffle: (a) => [...a].reverse() }); // would differ if re-shuffled
  assert.equal(again.item.id, first.item.id);
  assert.deepEqual(again.item.options.map((o) => o.text), first.item.options.map((o) => o.text));
});

test('item retires after 2 distinct annotations (coverage)', () => {
  const { db, A, B, C } = setup();
  ann(db, 1, A); ann(db, 1, B);
  for (let i = 0; i < 5; i++) {
    const r = getNextItem(db, C, { shuffle: idShuffle });
    if (r.status === 'item') assert.notEqual(r.item.id, 1);
    db.prepare('DELETE FROM claims WHERE annotator_id = ?').run(C);
  }
});

test('active claim by another annotator reserves the 2nd slot', () => {
  const { db, A, B, C } = setup();
  db.prepare('DELETE FROM generations WHERE item_id IN (2,3)').run();
  db.prepare('DELETE FROM items WHERE id IN (2,3)').run();
  ann(db, 1, A);
  getNextItem(db, B, { shuffle: idShuffle });
  assert.equal(getNextItem(db, C, { shuffle: idShuffle }).status, 'done');
});

test('expired claims free the slot', () => {
  const { db, A, B } = setup();
  db.prepare('DELETE FROM generations WHERE item_id IN (2,3)').run();
  db.prepare('DELETE FROM items WHERE id IN (2,3)').run();
  ann(db, 1, A);
  const t0 = Date.parse('2026-06-24T00:00:00Z');
  getNextItem(db, B, { now: t0, shuffle: idShuffle });
  const C = db.prepare("INSERT INTO annotators (first_name,last_name,email,consented_at,created_at) VALUES ('f','l','d@x','t','t')").run().lastInsertRowid;
  const r = getNextItem(db, C, { now: t0 + 31 * 60 * 1000, shuffle: idShuffle });
  assert.equal(r.status, 'item');
});

test('per-annotator cap stops serving', () => {
  const { db, A } = setup();
  const r = getNextItem(db, A, { cap: 0, shuffle: idShuffle });
  assert.equal(r.status, 'done');
  assert.equal(r.reason, 'cap_reached');
});

test('items with no generations are not served', () => {
  const { db, A } = setup();
  db.prepare('DELETE FROM generations').run(); // strip all options
  const r = getNextItem(db, A, { shuffle: idShuffle });
  assert.equal(r.status, 'done');
  assert.equal(r.reason, 'pool_empty');
});
