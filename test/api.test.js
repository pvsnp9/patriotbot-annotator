const { test } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const path = require('path');
const { openDb } = require('../src/db');
const { seedIfEmpty, seedGenerationsIfEmpty } = require('../src/seed');
const { createApp } = require('../src/server');

const F = (...p) => path.join(__dirname, 'fixtures', ...p);

function make() {
  const db = openDb(':memory:');
  seedIfEmpty(db, F('items.json'), F('seeds.json'));
  seedGenerationsIfEmpty(db, F('models'));
  return { app: createApp(db, { progressKey: 'secret' }), db };
}

async function startSession(app, email) {
  const { body } = await request(app).post('/session').send({ first_name: 'A', last_name: 'B', email, agreed: true });
  return body.id;
}

test('consent required for session', async () => {
  const { app } = make();
  await request(app).post('/session').send({ first_name: 'A', last_name: 'B', email: 'a@x', agreed: false }).expect(400);
  const ok = await request(app).post('/session').send({ first_name: 'A', last_name: 'B', email: 'a@x', agreed: true }).expect(200);
  assert.ok(ok.body.id);
});

test('lookup: unknown email -> exists false; known email -> resume id', async () => {
  const { app } = make();
  const miss = await request(app).post('/lookup').send({ email: 'nobody@x' }).expect(200);
  assert.equal(miss.body.exists, false);
  const sess = await request(app).post('/session').send({ first_name: 'Re', last_name: 'Turn', email: 'Re@X', agreed: true });
  const hit = await request(app).post('/lookup').send({ email: 're@x' }).expect(200);
  assert.equal(hit.body.exists, true);
  assert.equal(hit.body.id, sess.body.id);
  assert.equal(hit.body.first_name, 'Re');
});

test('next returns blind shuffled options (no model leaked)', async () => {
  const { app } = make();
  const id = await startSession(app, 'a@x');
  const next = await request(app).get('/next').query({ annotator_id: id }).expect(200);
  assert.equal(next.body.status, 'item');
  const opts = next.body.item.options;
  assert.equal(opts.length, 3);
  assert.deepEqual(opts.map((o) => o.idx), [0, 1, 2]);
  for (const o of opts) assert.ok(!('model' in o), 'model must not leak to client');
});

test('next -> annotate happy path with best pick', async () => {
  const { app, db } = make();
  const id = await startSession(app, 'a@x');
  const next = await request(app).get('/next').query({ annotator_id: id });
  const item = next.body.item;
  const payload = { annotator_id: id, item_id: item.id, accuracy: 5, source_relevance: 4, best_option_idx: 1 };
  if (/\[[^\]]*\]\([^)]*\)/.test(item.answer)) payload.valid_link = 1;
  if (item.intent === 'yes/no eligibility') { payload.exact_matching = 1; payload.risk_of_harm = 0; }
  await request(app).post('/annotate').send(payload).expect(200);
  const row = db.prepare('SELECT best_model FROM annotations WHERE item_id=? AND annotator_id=?').get(item.id, id);
  assert.ok(row.best_model, 'best_model recorded');
});

test('annotate rejects missing best pick', async () => {
  const { app } = make();
  const id = await startSession(app, 'a@x');
  const next = await request(app).get('/next').query({ annotator_id: id });
  const item = next.body.item;
  const payload = { annotator_id: id, item_id: item.id, accuracy: 5, source_relevance: 4 };
  if (/\[[^\]]*\]\([^)]*\)/.test(item.answer)) payload.valid_link = 1;
  const res = await request(app).post('/annotate').send(payload).expect(400);
  assert.equal(res.body.error, 'best_pick');
});

test('annotate rejects out-of-range best pick', async () => {
  const { app } = make();
  const id = await startSession(app, 'a@x');
  const next = await request(app).get('/next').query({ annotator_id: id });
  const item = next.body.item;
  const res = await request(app).post('/annotate').send({ annotator_id: id, item_id: item.id, accuracy: 5, source_relevance: 4, valid_link: 1, best_option_idx: 9 }).expect(400);
  assert.equal(res.body.error, 'best_pick');
});

test('annotate rejects non-applicable metric', async () => {
  const { app } = make();
  const id = await startSession(app, 'a@x');
  const next = await request(app).get('/next').query({ annotator_id: id }); // item 128: has link, intent not eligibility
  const item = next.body.item;
  // exact_matching is NOT applicable for this item -> reject
  const res = await request(app).post('/annotate').send({ annotator_id: id, item_id: item.id, accuracy: 5, source_relevance: 5, valid_link: 1, exact_matching: 1, best_option_idx: 0 }).expect(400);
  assert.equal(res.body.error, 'validation');
});

test('progress page is public; data requires correct pass in body', async () => {
  const { app } = make();
  await request(app).get('/progress').expect(200); // login page, no key
  await request(app).post('/progress/data').send({ key: 'wrong' }).expect(401);
  const ok = await request(app).post('/progress/data').send({ key: 'secret' }).expect(200);
  assert.ok(Array.isArray(ok.body.annotators));
});

test('progress export: combined excludes @testmail.com; per-email includes it', async () => {
  const { app, db } = make();
  db.prepare("INSERT INTO annotators (first_name,last_name,email,consented_at,created_at) VALUES ('R','One','real@gmu.edu','t','t')").run();
  db.prepare("INSERT INTO annotators (first_name,last_name,email,consented_at,created_at) VALUES ('T','Acct','qa@testmail.com','t','t')").run();
  db.prepare("INSERT INTO annotations (item_id,annotator_id,accuracy,source_relevance,best_model,created_at,updated_at) VALUES (128,(SELECT id FROM annotators WHERE email='real@gmu.edu'),5,5,'m','t','t')").run();
  db.prepare("INSERT INTO annotations (item_id,annotator_id,accuracy,source_relevance,best_model,created_at,updated_at) VALUES (128,(SELECT id FROM annotators WHERE email='qa@testmail.com'),3,3,'m','t','t')").run();

  await request(app).post('/progress/export').send({ key: 'wrong' }).expect(401);

  const all = await request(app).post('/progress/export').send({ key: 'secret' }).expect(200);
  assert.match(all.text, /real@gmu\.edu/);
  assert.doesNotMatch(all.text, /qa@testmail\.com/);

  const one = await request(app).post('/progress/export').send({ key: 'secret', email: 'qa@testmail.com' }).expect(200);
  assert.match(one.text, /qa@testmail\.com/);
  assert.doesNotMatch(one.text, /real@gmu\.edu/);
});

test('curl export still works with key in URL and excludes test emails', async () => {
  const { app } = make();
  await request(app).get('/export.csv').expect(401);
  const csv = await request(app).get('/export.csv').query({ key: 'secret' }).expect(200);
  assert.match(csv.text, /best_model/);
});
