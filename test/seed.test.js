const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { openDb } = require('../src/db');
const { seedIfEmpty, seedGenerationsIfEmpty } = require('../src/seed');

const ITEMS = path.join(__dirname, 'fixtures', 'items.json');
const SEEDS = path.join(__dirname, 'fixtures', 'seeds.json');
const MODELS = path.join(__dirname, 'fixtures', 'models');

test('seeds items and seeds, idempotently', () => {
  const db = openDb(':memory:');
  const first = seedIfEmpty(db, ITEMS, SEEDS);
  assert.equal(first.items, 2);
  assert.equal(first.seeds, 2);
  // running again does not duplicate
  const second = seedIfEmpty(db, ITEMS, SEEDS);
  assert.equal(second.items, 2);
  const item = db.prepare('SELECT * FROM items WHERE id = 128').get();
  assert.equal(item.source_seed_id, 38);
  assert.equal(item.page_type, 'FAQ');
  // ignored fields are not columns
  assert.equal('max_cos_sim' in item, false);
});

test('seeds model generations from seed/models/*.json, idempotently', () => {
  const db = openDb(':memory:');
  seedIfEmpty(db, ITEMS, SEEDS);
  const n1 = seedGenerationsIfEmpty(db, MODELS);
  assert.equal(n1, 6); // 2 items x 3 models
  const n2 = seedGenerationsIfEmpty(db, MODELS);
  assert.equal(n2, 6); // idempotent
  const models = db.prepare('SELECT model FROM generations WHERE item_id = 128 ORDER BY model').all().map((r) => r.model);
  assert.deepEqual(models, ['gemma-4-12B-it', 'llama-3.1-8B-it', 'qwen2.5-7B-it']);
});

test('skips generations whose item_id has no matching item (no FK crash)', () => {
  const db = openDb(':memory:');
  seedIfEmpty(db, ITEMS, SEEDS); // items 128, 201
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gen-'));
  fs.writeFileSync(
    path.join(tmp, 'm.json'),
    JSON.stringify([
      { id: 128, generated: 'ok', model: 'X', mode: 'sft' },
      { id: 999999, generated: 'orphan', model: 'X', mode: 'sft' },
    ])
  );
  const n = seedGenerationsIfEmpty(db, tmp);
  assert.equal(n, 1); // orphan id 999999 skipped, not a crash
});
