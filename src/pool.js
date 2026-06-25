const CAP = 100;
const COVERAGE = 2;
const LEASE_MS = 30 * 60 * 1000;

function fisherYates(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function stripCounts(row) {
  const { ann_count, other_claims, ...rest } = row;
  return rest;
}

// Returns the persisted blind display order of models for (annotator, item),
// creating it with a fresh shuffle on first serve so Back/resume is consistent.
function getModelOrder(db, annotatorId, itemId, nowIso, shuffle) {
  const existing = db
    .prepare('SELECT model_order FROM presentations WHERE annotator_id = ? AND item_id = ?')
    .get(annotatorId, itemId);
  if (existing) return JSON.parse(existing.model_order);

  const models = db.prepare('SELECT model FROM generations WHERE item_id = ? ORDER BY model').all(itemId).map((r) => r.model);
  const order = shuffle(models);
  db.prepare('INSERT OR IGNORE INTO presentations (annotator_id, item_id, model_order, created_at) VALUES (?,?,?,?)')
    .run(annotatorId, itemId, JSON.stringify(order), nowIso);
  const row = db.prepare('SELECT model_order FROM presentations WHERE annotator_id = ? AND item_id = ?').get(annotatorId, itemId);
  return JSON.parse(row.model_order);
}

// Public helper: the model names in displayed order (idx -> model), for mapping a pick.
function getPresentedModels(db, annotatorId, itemId) {
  const row = db.prepare('SELECT model_order FROM presentations WHERE annotator_id = ? AND item_id = ?').get(annotatorId, itemId);
  return row ? JSON.parse(row.model_order) : [];
}

function buildResult(db, annotatorId, item, completed, nowIso, shuffle) {
  const seed =
    item.source_seed_id != null
      ? db.prepare('SELECT id,question,answer,department,url,page_type FROM seeds WHERE id = ?').get(item.source_seed_id)
      : null;
  const order = getModelOrder(db, annotatorId, item.id, nowIso, shuffle);
  const byModel = {};
  for (const g of db.prepare('SELECT model, generated FROM generations WHERE item_id = ?').all(item.id)) byModel[g.model] = g.generated;
  const options = order.filter((m) => byModel[m] != null).map((m, idx) => ({ idx, text: byModel[m] }));
  return { status: 'item', item: { ...stripCounts(item), seed: seed || null, options }, completed };
}

function getNextItem(db, annotatorId, opts = {}) {
  const cap = opts.cap ?? CAP;
  const coverage = opts.coverage ?? COVERAGE;
  const leaseMs = opts.leaseMs ?? LEASE_MS;
  const now = opts.now ?? Date.now();
  const shuffle = opts.shuffle ?? fisherYates;
  const nowIso = new Date(now).toISOString();
  const cutoffIso = new Date(now - leaseMs).toISOString();

  return db.transaction(() => {
    const completed = db.prepare('SELECT COUNT(*) AS c FROM annotations WHERE annotator_id = ?').get(annotatorId).c;
    if (completed >= cap) return { status: 'done', reason: 'cap_reached', completed };

    const resume = db
      .prepare(
        `SELECT i.* FROM claims c JOIN items i ON i.id = c.item_id
         WHERE c.annotator_id = ? AND c.claimed_at > ?
         ORDER BY c.claimed_at LIMIT 1`
      )
      .get(annotatorId, cutoffIso);
    if (resume) return buildResult(db, annotatorId, resume, completed, nowIso, shuffle);

    const item = db
      .prepare(
        `SELECT i.*,
           (SELECT COUNT(*) FROM annotations a WHERE a.item_id = i.id) AS ann_count,
           (SELECT COUNT(*) FROM claims c WHERE c.item_id = i.id AND c.annotator_id <> ? AND c.claimed_at > ?) AS other_claims
         FROM items i
         WHERE (SELECT COUNT(*) FROM annotations a WHERE a.item_id = i.id) < ?
           AND EXISTS (SELECT 1 FROM generations g WHERE g.item_id = i.id)
           AND NOT EXISTS (SELECT 1 FROM annotations a WHERE a.item_id = i.id AND a.annotator_id = ?)
           AND NOT EXISTS (SELECT 1 FROM claims c WHERE c.item_id = i.id AND c.annotator_id = ? AND c.claimed_at > ?)
           AND ((SELECT COUNT(*) FROM annotations a WHERE a.item_id = i.id)
                + (SELECT COUNT(*) FROM claims c WHERE c.item_id = i.id AND c.annotator_id <> ? AND c.claimed_at > ?)) < ?
         ORDER BY ann_count ASC, other_claims ASC, i.id ASC
         LIMIT 1`
      )
      .get(annotatorId, cutoffIso, coverage, annotatorId, annotatorId, cutoffIso, annotatorId, cutoffIso, coverage);

    if (!item) return { status: 'done', reason: 'pool_empty', completed };

    db.prepare(
      `INSERT INTO claims (item_id, annotator_id, claimed_at) VALUES (?,?,?)
       ON CONFLICT(item_id, annotator_id) DO UPDATE SET claimed_at = excluded.claimed_at`
    ).run(item.id, annotatorId, nowIso);

    return buildResult(db, annotatorId, item, completed, nowIso, shuffle);
  })();
}

module.exports = { getNextItem, getPresentedModels, CAP, COVERAGE, LEASE_MS };
