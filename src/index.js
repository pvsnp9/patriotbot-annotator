const fs = require('fs');
const path = require('path');
const { openDb } = require('./db');
const { seedIfEmpty, seedGenerationsIfEmpty } = require('./seed');
const { createApp } = require('./server');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const SEED_DIR = process.env.SEED_DIR || path.join(__dirname, '..', 'seed');
const PORT = Number(process.env.PORT || 3000);
const PROGRESS_KEY = process.env.PROGRESS_KEY || '';

fs.mkdirSync(DATA_DIR, { recursive: true });
const db = openDb(path.join(DATA_DIR, 'annotations.db'));
const counts = seedIfEmpty(db, path.join(SEED_DIR, 'items.json'), path.join(SEED_DIR, 'seeds.json'));
const gens = seedGenerationsIfEmpty(db, path.join(SEED_DIR, 'models'));
console.log(`seeded: ${counts.items} items, ${counts.seeds} seeds, ${gens} generations`);
if (!PROGRESS_KEY) console.warn('WARNING: PROGRESS_KEY is empty; /progress and /export.csv will return 401 for everyone.');

createApp(db, { progressKey: PROGRESS_KEY }).listen(PORT, () => console.log(`annotator listening on :${PORT}`));
