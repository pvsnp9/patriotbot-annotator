const fs = require('fs');
const path = require('path');

function seedIfEmpty(db, itemsPath, seedsPath) {
  const seedCount = db.prepare('SELECT COUNT(*) AS c FROM seeds').get().c;
  if (seedCount === 0) {
    const seeds = JSON.parse(fs.readFileSync(seedsPath, 'utf8'));
    const ins = db.prepare(
      'INSERT OR IGNORE INTO seeds (id,question,answer,department,url,page_type) VALUES (?,?,?,?,?,?)'
    );
    db.transaction((rows) => {
      for (const s of rows) ins.run(Number(s.id), s.question, s.answer, s.department, s.url, s.page_type);
    })(seeds);
  }

  const itemCount = db.prepare('SELECT COUNT(*) AS c FROM items').get().c;
  if (itemCount === 0) {
    const items = JSON.parse(fs.readFileSync(itemsPath, 'utf8'));
    const ins = db.prepare(
      'INSERT OR IGNORE INTO items (id,question,answer,department,persona,intent,url,page_type,source_seed_id) VALUES (?,?,?,?,?,?,?,?,?)'
    );
    db.transaction((rows) => {
      for (const it of rows)
        ins.run(Number(it.id), it.question, it.answer, it.department, it.persona, it.intent, it.url, it.page_type, Number(it.source_seed_id));
    })(items);
  }

  return {
    items: db.prepare('SELECT COUNT(*) AS c FROM items').get().c,
    seeds: db.prepare('SELECT COUNT(*) AS c FROM seeds').get().c,
  };
}

function seedGenerationsIfEmpty(db, modelsDir) {
  const count = db.prepare('SELECT COUNT(*) AS c FROM generations').get().c;
  if (count === 0 && fs.existsSync(modelsDir)) {
    // generations referencing an item that isn't loaded would violate the FK
    // (INSERT OR IGNORE does NOT skip FK violations), so filter to known items.
    const itemIds = new Set(db.prepare('SELECT id FROM items').all().map((r) => r.id));
    const files = fs.readdirSync(modelsDir).filter((f) => f.endsWith('.json')).sort();
    const ins = db.prepare('INSERT OR IGNORE INTO generations (item_id, model, mode, generated) VALUES (?,?,?,?)');
    db.transaction(() => {
      for (const f of files) {
        const rows = JSON.parse(fs.readFileSync(path.join(modelsDir, f), 'utf8'));
        for (const r of rows) {
          if (r.generated == null || r.model == null || r.id == null) continue;
          const itemId = Number(r.id);
          if (!itemIds.has(itemId)) continue; // no matching item -> skip
          ins.run(itemId, String(r.model), r.mode != null ? String(r.mode) : null, String(r.generated));
        }
      }
    })();
  }
  return db.prepare('SELECT COUNT(*) AS c FROM generations').get().c;
}

module.exports = { seedIfEmpty, seedGenerationsIfEmpty };
