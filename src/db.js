const Database = require('better-sqlite3');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS annotators (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  consented_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS items (
  id INTEGER PRIMARY KEY,
  question TEXT, answer TEXT,
  department TEXT, persona TEXT, intent TEXT,
  url TEXT, page_type TEXT,
  source_seed_id INTEGER
);
CREATE TABLE IF NOT EXISTS seeds (
  id INTEGER PRIMARY KEY,
  question TEXT, answer TEXT,
  department TEXT, url TEXT, page_type TEXT
);
CREATE TABLE IF NOT EXISTS generations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL REFERENCES items(id),
  model TEXT NOT NULL,
  mode TEXT,
  generated TEXT NOT NULL,
  UNIQUE(item_id, model)
);
CREATE TABLE IF NOT EXISTS presentations (
  annotator_id INTEGER NOT NULL REFERENCES annotators(id),
  item_id INTEGER NOT NULL REFERENCES items(id),
  model_order TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(annotator_id, item_id)
);
CREATE TABLE IF NOT EXISTS annotations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL REFERENCES items(id),
  annotator_id INTEGER NOT NULL REFERENCES annotators(id),
  accuracy INTEGER,
  source_relevance INTEGER,
  valid_link INTEGER,
  exact_matching INTEGER,
  risk_of_harm INTEGER,
  best_model TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(item_id, annotator_id)
);
CREATE TABLE IF NOT EXISTS claims (
  item_id INTEGER NOT NULL REFERENCES items(id),
  annotator_id INTEGER NOT NULL REFERENCES annotators(id),
  claimed_at TEXT NOT NULL,
  UNIQUE(item_id, annotator_id)
);
CREATE INDEX IF NOT EXISTS idx_ann_item ON annotations(item_id);
CREATE INDEX IF NOT EXISTS idx_ann_annotator ON annotations(annotator_id);
CREATE INDEX IF NOT EXISTS idx_claims_item ON claims(item_id);
CREATE INDEX IF NOT EXISTS idx_gen_item ON generations(item_id);
`;

function openDb(path) {
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  return db;
}

module.exports = { openDb };
