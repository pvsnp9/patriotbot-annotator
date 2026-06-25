function upsertAnnotator(db, { first_name, last_name, email }, nowIso) {
  const fn = String(first_name || '').trim();
  const ln = String(last_name || '').trim();
  const e = String(email || '').trim().toLowerCase();
  if (!fn || !ln || !e) throw new Error('first_name, last_name and email are required');

  const existing = db.prepare('SELECT id FROM annotators WHERE email = ?').get(e);
  if (existing) return existing.id;

  const info = db
    .prepare('INSERT INTO annotators (first_name,last_name,email,consented_at,created_at) VALUES (?,?,?,?,?)')
    .run(fn, ln, e, nowIso, nowIso);
  return Number(info.lastInsertRowid);
}

module.exports = { upsertAnnotator };
